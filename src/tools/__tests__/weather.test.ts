import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WeatherTool } from '../weather';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('WeatherTool', () => {
  let weatherTool: WeatherTool;

  beforeEach(() => {
    weatherTool = new WeatherTool();
    vi.clearAllMocks();
  });

  describe('geocoding', () => {
    it('should successfully geocode a location', async () => {
      // Mock successful geocoding response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          results: [{
            latitude: 40.7128,
            longitude: -74.0060,
            name: 'New York'
          }]
        })
      });

      // Mock weather API response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          latitude: 40.7128,
          longitude: -74.0060,
          timezone: 'UTC',
          current: {
            temperature_2m: 20,
            apparent_temperature: 22,
            rain: 0,
            time: '2024-03-20T12:00'
          },
          daily: {
            time: ['2024-03-20'],
            temperature_2m_max: [25],
            temperature_2m_min: [15],
            sunrise: ['2024-03-20T06:00'],
            sunset: ['2024-03-20T18:00']
          }
        })
      });

      const result = await weatherTool.run({
        location: { name: 'New York' },
        startDate: '2024-03-20',
        endDate: '2024-03-20'
      });

      const weatherData = JSON.parse(result.getContent());
      expect(weatherData.latitude).toBe(40.7128);
      expect(weatherData.longitude).toBe(-74.006);
    });

    it('should throw error for invalid location', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ results: [] })
      });

      await expect(weatherTool.run({
        location: { name: 'InvalidLocation123' },
        startDate: '2024-03-20',
        endDate: '2024-03-20'
      })).rejects.toThrow("Location 'InvalidLocation123' not found");
    });
  });

  describe('direct coordinates', () => {
    it('should accept direct latitude/longitude input', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          latitude: 51.5074,
          longitude: -0.1278,
          timezone: 'UTC',
          current: {
            temperature_2m: 18,
            apparent_temperature: 19,
            rain: 0,
            time: '2024-03-20T12:00'
          },
          daily: {
            time: ['2024-03-20'],
            temperature_2m_max: [20],
            temperature_2m_min: [15],
            sunrise: ['2024-03-20T06:00'],
            sunset: ['2024-03-20T18:00']
          }
        })
      });

      const result = await weatherTool.run({
        location: { 
          latitude: 51.5074,
          longitude: -0.1278
        },
        startDate: '2024-03-20',
        endDate: '2024-03-20'
      });

      const weatherData = JSON.parse(result.getContent());
      expect(weatherData.latitude).toBe(51.5074);
      expect(weatherData.longitude).toBe(-0.1278);
    });
  });

  describe('error handling', () => {
    it('should handle API errors gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Service Unavailable',
        text: () => Promise.resolve('Service Unavailable')
      });

      await expect(weatherTool.run({
        location: { 
          latitude: 51.5074,
          longitude: -0.1278
        },
        startDate: '2024-03-20',
        endDate: '2024-03-20'
      })).rejects.toThrow('Weather API request failed');
    });

    it('should validate date format', async () => {
      await expect(weatherTool.run({
        location: { name: 'London' },
        startDate: 'invalid-date',
        endDate: '2024-03-20'
      })).rejects.toThrow();
    });
  });
}); 