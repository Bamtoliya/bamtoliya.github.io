// One object per repository serializes requests across Cloudflare locations.
export class PublishGate {
  constructor(state) { this.state = state; }

  async fetch(request) {
    if (request.method !== 'POST') return new Response(null, { status: 405 });
    return this.state.blockConcurrencyWhile(async () => {
      const lease = await this.state.storage.get('lease');
      if (lease && lease.until > Date.now()) {
        return Response.json({ message: '최근 발행 요청이 처리 중입니다. 잠시 후 상태를 확인하세요.' }, { status: 409 });
      }
      await this.state.storage.put('lease', { until: Date.now() + 60_000 });
      return new Response(null, { status: 204 });
    });
  }
}
