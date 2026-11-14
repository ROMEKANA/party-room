import {readdir,readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
const modules = [];
for (const name of ['web/config.js',...(await readdir('server')).sort().map(name=>'server/'+name)]) {
  const source = await readFile(name,'utf8');
  const imports = source.replace(/^import \{([^}]+)\} from '([^']+)';$/gm, (_, names, path) =>
    `const {${names}} = modules[${JSON.stringify(path.startsWith('../web/') ? 'web/config.js' : 'server/'+path.slice(2))}]();`);
  const exports = [...imports.matchAll(/^export (?:async )?(?:class|function|const) (\w+)/gm)].map(match=>match[1]);
  modules.push(`modules[${JSON.stringify(name)}] = () => cache[${JSON.stringify(name)}] ??= (() => {\n${imports.replace(/^export /gm,'')}\nreturn {${exports.join(',')}};\n})();`);
}
const assets = Object.fromEntries(await Promise.all((await readdir('web')).map(async file=>[file,await readFile('web/'+file,'utf8')])));
await mkdir('dist/server',{recursive:true});
await mkdir('dist/.openai',{recursive:true});
await copyFile('.openai/hosting.json','dist/.openai/hosting.json');
await writeFile('dist/server/index.js',`
const modules = {}, cache = {};
${modules.join('\n')}
const assets = ${JSON.stringify(assets)};
const {api} = modules['server/api.js']();
const {staticResponse} = modules['server/assets.js']();
export default {fetch(request, env) {
  return new URL(request.url).pathname.startsWith('/api/')
    ? api(request,env.DB)
    : staticResponse(request,assets);
}};
`);
await import('../dist/server/index.js');
