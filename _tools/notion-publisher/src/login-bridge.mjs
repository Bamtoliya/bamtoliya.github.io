// A short-lived, single-use handoff. The browser keeps a random verifier;
// only its SHA-256 hash travels through the OAuth popup URL.
export class LoginBridge {
  constructor(state) { this.state = state; }

  async fetch(request) {
    if (request.method !== 'POST') return new Response(null, { status: 405 });
    const path = new URL(request.url).pathname;
    if (!['/complete', '/claim'].includes(path)) return new Response(null, { status: 404 });
    return this.state.blockConcurrencyWhile(async () => {
      const ticket = await this.state.storage.get('ticket');
      const live = ticket && ticket.exp > Date.now();
      if (path === '/complete') {
        if (live) return new Response(null, { status: 409 });
        const body = await request.json();
        if ((!body.session && !body.error) || !Number.isFinite(body.exp) || body.exp <= Date.now() || body.exp > Date.now() + 600_000) {
          return new Response(null, { status: 400 });
        }
        await this.state.storage.put('ticket', body);
        await this.state.storage.setAlarm(body.exp);
        return new Response(null, { status: 204 });
      }
      if (!live || ticket.spent) return Response.json({ pending: true });
      await this.state.storage.put('ticket', { spent: true, exp: ticket.exp });
      return Response.json(ticket);
    });
  }

  async alarm() { await this.state.storage.deleteAll(); }
}
