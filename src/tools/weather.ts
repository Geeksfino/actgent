import { Tool, JSONOutput, RunOptions } from "../core/Tool";
import { ExecutionContext } from "../core/ExecutionContext";
import { z } from "zod";

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
  location: {
    name?: string;
    country?: string;
    language?: string;
    latitude?: number;
    longitude?: number;
  };
  startDate: string;
  endDate?: string;
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
    return z.object({
      location: z.object({
        name: z.string().optional(),
        country: z.string().optional(),
        language: z.string().optional().default("en"),
        latitude: z.number().optional(),
        longitude: z.number().optional(),
      }).refine(data => 
        (data.name !== undefined) || (data.latitude !== undefined && data.longitude !== undefined),
        "Either provide location name or latitude/longitude coordinates"
      ),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      temperatureUnit: z.enum(["celsius", "fahrenheit"]).optional().default("celsius"),
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
    // Resolve coordinates if location name is provided
    let coordinates: { latitude: number; longitude: number };
    if (input.location.name) {
      coordinates = await this.geocode(input.location.name, input.location.country);
    } else if (input.location.latitude && input.location.longitude) {
      coordinates = {
        latitude: input.location.latitude,
        longitude: input.location.longitude,
      };
    } else {
      throw new Error("Invalid location input");
    }

    // Prepare API parameters
    const params = new URLSearchParams({
      latitude: coordinates.latitude.toString(),
      longitude: coordinates.longitude.toString(),
      timezone: "UTC",
      current: "temperature_2m,apparent_temperature,rain",
      daily: "temperature_2m_max,temperature_2m_min,sunrise,sunset",
      start_date: input.startDate,
      ...(input.endDate && { end_date: input.endDate }),
      temperature_unit: input.temperatureUnit || "celsius",
    });

    // Make API request
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, {
      signal: options.signal,
    });

    if (!response.ok) {
      throw new Error(`Weather API request failed: ${response.statusText}`);
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
      daily: {
        time: rawData.daily.time,
        temperatureMax: rawData.daily.temperature_2m_max,
        temperatureMin: rawData.daily.temperature_2m_min,
        sunrise: rawData.daily.sunrise,
        sunset: rawData.daily.sunset,
      },
    };

    return new JSONOutput(weatherData);
  }
}

export { WeatherTool, type WeatherToolInput, type WeatherData };
