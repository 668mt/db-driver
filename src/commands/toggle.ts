import { getConnection, setConnectionEnabled, closeConfigDb } from '../store/configStore.js';

export interface ToggleOptions {
  json: boolean;
}

/**
 * 启用 / 禁用一个连接。
 * 禁用只是锁住「数据访问」，配置（账号密码 / 权限位）都保留，随时可以再启用。
 */
export async function runEnable(dbId: string, options: ToggleOptions): Promise<void> {
  await toggle(dbId, true, options);
}

export async function runDisable(dbId: string, options: ToggleOptions): Promise<void> {
  await toggle(dbId, false, options);
}

async function toggle(dbId: string, enabled: boolean, options: ToggleOptions): Promise<void> {
  const existing = getConnection(dbId);
  if (!existing) {
    throw new Error(
      `数据库连接不存在: ${dbId}\n运行 db-driver list 查看已配置的连接`
    );
  }

  if (existing.enabled === false && !enabled) {
    if (options.json) {
      console.log(JSON.stringify({ ok: true, dbId, enabled: false, changed: false }, null, 2));
    } else {
      console.log(`ℹ️  连接 "${dbId}" 本来就是禁用状态`);
    }
    closeConfigDb();
    return;
  }

  const conn = setConnectionEnabled(dbId, enabled);
  if (!conn) {
    throw new Error(`数据库连接不存在: ${dbId}`);
  }

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          dbId,
          enabled,
          changed: true,
          type: conn.type,
          endpoint: `${conn.user}@${conn.host}:${conn.port}/${conn.database}`,
        },
        null,
        2
      )
    );
  } else if (enabled) {
    console.log(`✅ 已启用连接 "${dbId}"`);
    console.log(`   现在可以用 db-driver execute ${dbId} "SELECT ..." 了`);
  } else {
    console.log(`🔒 已禁用连接 "${dbId}"`);
    console.log(`   该连接的任何数据访问（schema / sample / execute / script）都会被拒绝`);
    console.log(`   配置与权限位都保留，重新启用：db-driver enable ${dbId}`);
  }
  closeConfigDb();
}
