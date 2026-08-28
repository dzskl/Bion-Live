import type { Response } from 'express';

type Client = { id: number; res: Response };

let nextId = 1;
const clients = new Set<Client>();

export function addClient(res: Response): () => void {
  const client: Client = { id: nextId++, res };
  clients.add(client);
  res.write(`retry: 2000\n\n`);
  return () => clients.delete(client);
}

export function broadcast(type: string, payload: unknown): void {
  const chunk = `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of clients) {
    try {
      client.res.write(chunk);
    } catch {
      clients.delete(client);
    }
  }
}

export function clientCount(): number {
  return clients.size;
}
