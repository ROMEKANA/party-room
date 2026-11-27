import {readdir,readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
const modules = [];
for (const name of ['web/config.js','web/player-profile.js','web/placement.js','web/games.js','web/version.js','web/battle-jobs.js','web/battle-rules.js','web/number-clash-rules.js',...(await readdir('server')).sort().map(name=>'server/'+name)]) {
  const source = await readFile(name,'utf8');
  const imports = source.replace(/^import \{([^}]+)\} from '([^']+)';$/gm, (_, names, path) =>
    `const {${names.replace(/\s+as\s+/g,':')}} = modules[${JSON.stringify(path.startsWith('../web/') ? path.slice(3) : name.slice(0,name.lastIndexOf('/')+1)+path.slice(2))}]();`);
  const exports = [...imports.matchAll(/^export (?:async )?(?:class|function|const) (\w+)/gm)].map(match=>match[1]);
  modules.push(`modules[${JSON.stringify(name)}] = () => cache[${JSON.stringify(name)}] ??= (() => {\n${imports.replace(/^export /gm,'')}\nreturn {${exports.join(',')}};\n})();`);
}
const assetEntries = await Promise.all((await readdir('web')).map(async file => {
  const content = await readFile('web/'+file);
  const value = file.endsWith('.png')
    ? `Uint8Array.from(atob(${JSON.stringify(content.toString('base64'))}), byte => byte.charCodeAt(0))`
    : JSON.stringify(content.toString('utf8'));
  return `  ${JSON.stringify(file)}: ${value}`;
}));
await mkdir('dist/server',{recursive:true});
await mkdir('dist/.openai',{recursive:true});
await copyFile('.openai/hosting.json','dist/.openai/hosting.json');
await writeFile('dist/server/index.js',`
const modules = {}, cache = {};
${modules.join('\n')}
const assets = {
${assetEntries.join(',\n')}
};
const {api} = modules['server/api.js']();
const {staticResponse} = modules['server/assets.js']();
export default {fetch(request, env) {
  return new URL(request.url).pathname.startsWith('/api/')
    ? api(request,env.DB)
    : staticResponse(request,assets);
}};
`);
await import('../dist/server/index.js');
