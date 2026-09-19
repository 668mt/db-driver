import { listConnections, closeConfigDb } from '../store/configStore.js';

export async function runList(options: { json: boolean }): Promise<void> {
  const all = listConnections();
  if (options.json) {
    console.log(
      JSON.stringify(
        all.map((c) => ({
          dbId: c.dbId,
          type: c.type,
          host: c.host,
          port: c.port,
          database: c.database,
          user: c.user,
          permissions: c.permissions,
          updatedAt: c.updatedAt,
        })),
        null,
        2
      )
    );
    closeConfigDb();
    return;
  }

  if (all.length === 0) {
    console.log('(没有已配置的数据库连接。先运行 db-driver config)');
    closeConfigDb();
    return;
  }

  const dbIdWidth = Math.max(4, ...all.map((c) => c.dbId.length));
  const typeWidth = Math.max(4, ...all.map((c) => c.type.length));

  console.log(`\n📚 ${all.length} 个连接:\n`);
  console.log(
    'dbId'.padEnd(dbIdWidth + 2) +
      'Type'.padEnd(typeWidth + 2) +
      'Endpoint'.padEnd(40) +
      'Permissions'
  );
  console.log('-'.repeat(dbIdWidth + 2 + typeWidth + 2 + 40 + 24));
  for (const c of all) {
    const endpoint = `${c.user}@${c.host}:${c.port}/${c.database}`;
    const perms = formatPerms(c.permissions);
    console.log(
      c.dbId.padEnd(dbIdWidth + 2) +
        c.type.padEnd(typeWidth + 2) +
        endpoint.padEnd(40) +
        perms
    );
  }
  console.log('');
  closeConfigDb();
}

function formatPerms(p: { dmlQuery: boolean; dmlUpdate: boolean; dmlDelete: boolean; ddl: boolean }): string {
  const tags: string[] = [];
  if (p.dmlQuery) tags.push('SELECT');
  if (p.dmlUpdate) tags.push('UPDATE');
  if (p.dmlDelete) tags.push('DELETE');
  if (p.ddl) tags.push('DDL');
  return tags.length === 0 ? '—' : tags.join(',');
}