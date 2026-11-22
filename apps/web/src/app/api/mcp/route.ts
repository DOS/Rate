import type { NextRequest } from 'next/server';
import {
  buildMcpCorsPreflightResponse,
  buildMcpMethodNotAllowedResponse,
  handleMcpHttpPost,
} from '@/server/rate/mcp';

export async function OPTIONS() {
  return buildMcpCorsPreflightResponse();
}

export async function GET() {
  return buildMcpMethodNotAllowedResponse();
}

export async function DELETE() {
  return buildMcpMethodNotAllowedResponse();
}

export async function POST(request: NextRequest) {
  return handleMcpHttpPost(request);
}
