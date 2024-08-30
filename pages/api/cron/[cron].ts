import { NextRequest, NextResponse } from 'next/server'
import axios from 'axios';
import { BskyAgent } from '@atproto/api';

export const config = {
  runtime: 'edge',
}

const API_BASE_URL = 'https://api.purpleair.com/v1';

async function getPurpleAirData(sensorIndex: string) {
  if (!process.env.PURPLEAIR_API_KEY) {
    throw new Error('PURPLEAIR_API_KEY is not set in environment variables');
  }

  const response = await axios.get(`${API_BASE_URL}/sensors/${sensorIndex}`, {
    headers: { 'X-API-Key': process.env.PURPLEAIR_API_KEY }
  });
  return response.data;
}

async function postToBluesky(content: string) {
  const agent = new BskyAgent({
      service: 'https://bsky.social',
  })

  const username = process.env.BLUESKY_USERNAME;
  const password = process.env.BLUESKY_PASSWORD;

  if (!username || !password) {
    throw new Error('Missing bluesky username or password');
  }
  await agent.login({identifier: username, password});
  await agent.post({text: content});
}

interface AqiSummary {
  emoji: string,
  label: string,
  displayAqi: string
}

interface AqiLevel {
  color: string;
  emoji: string,
  label: string;
  upperBound: number;
}

function getAqiLevel(aqi: number): AqiLevel {

  const aqiLevels: AqiLevel[] = [
    { color: 'green', label: 'Good', upperBound: 50, emoji: '🟢'},
    { color: 'yellow', label: 'Moderate', upperBound: 100, emoji: '🟡'},
    { color: 'orange', label: 'Unhealthy for sensitive groups', upperBound: 150, emoji: '🟠'},
    { color: 'red', label: 'Unhealthy', upperBound: 200, emoji: '🔴'},
    { color: 'purple', label: 'Very unhealthy', upperBound: 300, emoji: '🟣'},
    // Brown is closest to maroon and also brown is what the sky looks like
    { color: 'maroon', label: 'Hazardous', upperBound: Infinity, emoji: '🟤'}
  ];

  return aqiLevels.find(level => aqi <= level.upperBound) || aqiLevels[aqiLevels.length - 1];
}

function getAqiSummary(aqi: number) {
  const aqiRounded = Math.round(aqi);
  const [level, levelRounded] = [getAqiLevel(aqi), getAqiLevel(aqiRounded)];
  return {
    emoji: level.emoji,
    label: level.label,
    displayAqi: level.color === levelRounded.color ? aqiRounded : aqi
  }
}

async function postAqiToBluesky() {
    if (!process.env.SENSOR_INDEX) {
    throw new Error('SENSOR_INDEX is not set in environment variables');
  }

    const data = await getPurpleAirData(process.env.SENSOR_INDEX);
    const aqi = data.sensor.stats['pm2.5_10minute'];
    const summary = getAqiSummary(aqi);
    await postToBluesky(`AQI near Central Park, New York: ${summary.displayAqi} ${summary.emoji} (${summary.label})`);
}


export default async function handler(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new NextResponse('Cron secret is wrong or missing', { status: 401 });
  }

  const response = await postAqiToBluesky()
  return new NextResponse(JSON.stringify(response), {
    status: 200,
  })
}
