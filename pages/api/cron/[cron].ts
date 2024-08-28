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

async function postAqiToBluesky() {
    if (!process.env.SENSOR_INDEX) {
    throw new Error('SENSOR_INDEX is not set in environment variables');
  }

    const data = await getPurpleAirData(process.env.SENSOR_INDEX);
    const aqi = data.sensor.stats['pm2.5_10minute'];

    await postToBluesky(`Current AQI near Central Park, NY: ${aqi}`);
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
