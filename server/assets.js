const types = {html:'text/html',css:'text/css',js:'text/javascript',svg:'image/svg+xml'};
export function staticResponse(request, assets) {
  const path = new URL(request.url).pathname.slice(1) || 'index.html';
  if (!Object.hasOwn(assets,path)) return new Response('Not found',{status:404});
  const content = typeof assets[path] === 'function' ? assets[path]() : assets[path];
  return new Response(content,{headers:{
    'Content-Type':types[path.split('.').pop()]+'; charset=utf-8',
    'Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff',
    'Content-Security-Policy':"default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; form-action 'self'",
  }});
}
