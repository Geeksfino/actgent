import { Tool, JSONOutput, RunOptions } from "../core/Tool";
import { ExecutionContext } from "../core/ExecutionContext";
import { z } from "zod";
import { program } from 'commander';

// API Response Types
interface GeocodingResult {
  results?: Array<{
    latitude: number;
    longitude: number;
    name: string;
  }>;
}

interface OpenMeteoResponse {
  latitude: number;
  longitude: number;
  timezone: string;
  current: {
    temperature_2m: number;
    apparent_temperature: number;
    rain: number;
    time: string;
  };
  daily: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    sunrise: string[];
    sunset: string[];
  };
}

// Define the tool's input schema
interface WeatherToolInput {
  location: string | {
    name?: string;
    country?: string;
    language?: string;
    latitude?: number;
    longitude?: number;
  };
  startDate?: string;
  start_date?: string;
  endDate?: string;
  end_date?: string;
  temperatureUnit?: "celsius" | "fahrenheit";
}

// Define the weather data response interface
interface WeatherData {
  latitude: number;
  longitude: number;
  timezone: string;
  current: {
    temperature: number;
    apparentTemperature: number;
    rain: number;
    time: string;
  };
  daily: {
    time: string[];
    temperatureMax: number[];
    temperatureMin: number[];
    sunrise: string[];
    sunset: string[];
  };
}

class WeatherTool extends Tool<WeatherToolInput, JSONOutput<WeatherData>> {
  constructor() {
    super(
      "WeatherTool",
      "Retrieve current and forecasted weather data for a location using OpenMeteo API"
    );
  }

  schema(): z.ZodSchema<WeatherToolInput> {
    const dateSchema = z.string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine(
        (date) => {
          const inputDate = new Date(date);
          const minDate = new Date('2016-01-01');
          const maxDate = new Date();
          maxDate.setDate(maxDate.getDate() + 16); // Add 16 days to current date
          return inputDate >= minDate && inputDate <= maxDate;
        },
        (date) => ({
          message: `Date must be between 2016-01-01 and ${new Date(Date.now() + 16 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]} (16 days from today)`
        })
      );

    return z.object({
      location: z.union([
        z.string(),
        z.object({
          name: z.string().optional(),
          country: z.string().optional(),
          language: z.string().optional().default("en"),
          latitude: z.number().optional(),
          longitude: z.number().optional(),
        }).refine(data => 
          (data.name !== undefined) || (data.latitude !== undefined && data.longitude !== undefined),
          "Either provide location name or latitude/longitude coordinates"
        )
      ]),
      startDate: dateSchema.optional(),
      start_date: dateSchema.optional(),
      endDate: dateSchema.optional(),
      end_date: dateSchema.optional(),
      temperatureUnit: z.enum(["celsius", "fahrenheit"]).optional().default("celsius"),
    }).superRefine((data, ctx) => {
      // Get the effective start and end dates
      const startDate = data.startDate || data.start_date;
      const endDate = data.endDate || data.end_date;
      
      // If we have a start date, we must have an end date
      if (startDate && !endDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "endDate is required when startDate is provided",
          path: ["endDate"],
        });
      }

      // Validate that end date is not before start date
      if (startDate && endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        if (end < start) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "End date cannot be before start date",
            path: ["endDate"],
          });
        }

        // Check if the date range exceeds 16 days
        const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
        if (daysDiff > 16) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Date range cannot exceed 16 days",
            path: ["endDate"],
          });
        }
      }
    });
  }

  private async geocode(location: string, country?: string): Promise<{ latitude: number; longitude: number }> {
    const params = new URLSearchParams({
      name: location,
      count: "1",
      format: "json",
      ...(country && { country }),
    });

    const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params}`);
    if (!response.ok) {
      throw new Error(`Geocoding failed: ${response.statusText}`);
    }

    const data = await response.json() as GeocodingResult;
    if (!data.results?.length) {
      throw new Error(`Location '${location}' not found`);
    }

    return {
      latitude: data.results[0].latitude,
      longitude: data.results[0].longitude,
    };
  }

  protected async execute(
    input: WeatherToolInput,
    context: ExecutionContext,
    options: RunOptions
  ): Promise<JSONOutput<WeatherData>> {
    console.log(`WeatherTool: Executing with input:`, input);
    // Convert string location to object format
    const locationInput = typeof input.location === 'string' 
      ? { name: input.location }
      : input.location;

    // Resolve coordinates if location name is provided
    let coordinates: { latitude: number; longitude: number };
    if (locationInput.name) {
      coordinates = await this.geocode(locationInput.name, locationInput.country);
      console.log('Resolved coordinates:', coordinates);
    } else if (locationInput.latitude && locationInput.longitude) {
      coordinates = {
        latitude: locationInput.latitude,
        longitude: locationInput.longitude,
      };
    } else {
      throw new Error("Invalid location input");
    }

    // Get effective dates from either format
    const effectiveStartDate = input.startDate || input.start_date;
    const effectiveEndDate = input.endDate || input.end_date;

    // Prepare API parameters
    const params = new URLSearchParams({
      latitude: coordinates.latitude.toString(),
      longitude: coordinates.longitude.toString(),
      timezone: "UTC",
      temperature_unit: input.temperatureUnit || "celsius",
    });

    // Add forecast parameters if dates are provided
    if (effectiveStartDate && effectiveEndDate) {
      params.append("daily", "temperature_2m_max,temperature_2m_min,sunrise,sunset");
      params.append("start_date", effectiveStartDate);
      params.append("end_date", effectiveEndDate);
    }

    // Always include current weather
    params.append("current", "temperature_2m,apparent_temperature,rain");

    // Debug: Log the full URL
    const url = `https://api.open-meteo.com/v1/forecast?${params}`;
    console.log('Making request to:', url);

    // Make API request
    const response = await fetch(url, {
      signal: options.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Response status:', response.status);
      console.error('Response status text:', response.statusText);
      console.error('Response body:', errorText);
      throw new Error(`Weather API request failed: ${response.statusText} - ${errorText}`);
    }

    const rawData = await response.json() as OpenMeteoResponse;

    // Transform the data into our desired format
    const weatherData: WeatherData = {
      latitude: rawData.latitude,
      longitude: rawData.longitude,
      timezone: rawData.timezone,
      current: {
        temperature: rawData.current.temperature_2m,
        apparentTemperature: rawData.current.apparent_temperature,
        rain: rawData.current.rain,
        time: rawData.current.time,
      },
      daily: rawData.daily ? {
        time: rawData.daily.time,
        temperatureMax: rawData.daily.temperature_2m_max,
        temperatureMin: rawData.daily.temperature_2m_min,
        sunrise: rawData.daily.sunrise,
        sunset: rawData.daily.sunset,
      } : {
        time: [],
        temperatureMax: [],
        temperatureMin: [],
        sunrise: [],
        sunset: [],
      }
    };

    // Add metadata
    const metadata = {
      timestamp: new Date().toISOString(),
      source: 'OpenMeteo API',
      coordinates: coordinates,
      requestParams: {
        startDate: effectiveStartDate,
        endDate: effectiveEndDate,
        temperatureUnit: input.temperatureUnit
      }
    };

    return new JSONOutput(weatherData, metadata);
  }
}

export { WeatherTool, type WeatherToolInput, type WeatherData };

async function main() {
  program
    .name('weather')
    .description('Get weather information from the command line')
    .option('-l, --location <string>', 'Location (city name or coordinates)')
    .option('-s, --start-date <string>', 'Start date (YYYY-MM-DD)')
    .option('-e, --end-date <string>', 'End date (YYYY-MM-DD), defaults to start date if not provided')
    .option('-u, --unit <string>', 'Temperature unit (celsius or fahrenheit)', 'celsius')
    .parse();

  const options = program.opts();

  if (!options.location || !options.startDate) {
    console.error('Error: Location and start date are required');
    program.help();
    process.exit(1);
  }

  try {
    const tool = new WeatherTool();
    const result = await tool.run({
      location: options.location,
      startDate: options.startDate,
      endDate: options.endDate || options.startDate,
      temperatureUnit: options.unit
    });

    const weatherData = JSON.parse(result.getContent());
    
    // Debug logs for result object
    console.log('\nResult object:', {
      content: result.getContent(),
      metadata: result.metadata,
      hasMetadata: 'metadata' in result,
      properties: Object.keys(result)
    });

    // Pretty print results
    console.log('\nWeather Information:\n');
    console.log(`Location: ${options.location}`);
    console.log(`Timezone: ${weatherData.timezone}\n`);

    console.log('Current Weather:');
    console.log(`Temperature: ${weatherData.current.temperature}°${options.unit === 'celsius' ? 'C' : 'F'}`);
    console.log(`Feels Like: ${weatherData.current.apparentTemperature}°${options.unit === 'celsius' ? 'C' : 'F'}`);
    console.log(`Rain: ${weatherData.current.rain}mm\n`);

    console.log('Daily Forecast:');
    weatherData.daily.time.forEach((time: string, index: number) => {
      console.log(`\nDate: ${time}`);
      console.log(`Max Temperature: ${weatherData.daily.temperatureMax[index]}°${options.unit === 'celsius' ? 'C' : 'F'}`);
      console.log(`Min Temperature: ${weatherData.daily.temperatureMin[index]}°${options.unit === 'celsius' ? 'C' : 'F'}`);
      console.log(`Sunrise: ${weatherData.daily.sunrise[index]}`);
      console.log(`Sunset: ${weatherData.daily.sunset[index]}`);
    });

    // Print metadata
    console.log('\nMetadata:', result.metadata);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

// Only run main when this file is executed directly
if (require.main === module) {
  main().catch(console.error);
}
