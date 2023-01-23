import { $, Context, Logger, Quester, Schema } from 'koishi'
import Assets from '@koishijs/assets'
import FormData from 'form-data'

declare module 'koishi' {
  interface Tables {
    assets: CheveretoAssets.Asset
  }
}

class CheveretoAssets extends Assets<CheveretoAssets.Config> {
  static using = ['database'] as const

  types = ['image']
  http: Quester
  logger: Logger

  constructor(ctx: Context, config: CheveretoAssets.Config) {
    super(ctx, config)
    this.http = ctx.http.extend({
      endpoint: config.endpoint,
      headers: {
        'X-API-Key': config.token
      }
    })
    this.logger = ctx.logger('chevereto')
    ctx.model.extend('assets', {
      id: 'integer',
      hash: 'string',
      name: 'string',
      size: 'integer',
      url: 'string'
    }, {
      autoInc: true
    })
  }

  async upload(url: string, file: string) {
    const { buffer, filename, hash } = await this.analyze(url, file)
    const [dbFile] = await this.ctx.database.get('assets', { hash })
    if (dbFile) return dbFile.url
    const payload = new FormData()
    payload.append('source', buffer, filename)
    payload.append('key', this.config.token)
    payload.append('title', file)
    const data = await this.http.post('/api/1/upload', payload, { headers: payload.getHeaders() })
    await this.ctx.database.create('assets', {
      hash: hash,
      name: filename,
      size: data.image.size
    })
    return data.image.url
  }

  async stats() {
    const selection = this.ctx.database.select('assets')
    const [assetCount, assetSize] = await Promise.all([
      selection.execute(row => $.count(row.id)),
      selection.execute(row => $.sum(row.size)),
    ])
    return { assetCount, assetSize }
  }
}

namespace CheveretoAssets {
  export interface Asset {
    id: number
    hash: string
    name: string
    size: number
    url: string
  }
  export interface Config extends Assets.Config {
    token: string
    endpoint: string
  }

  export const Config: Schema<Config> = Schema.intersect([
    Schema.object({
      token: Schema.string().description('访问令牌。').role('secret').required(),
      endpoint: Schema.string().role('link').description('服务器地址。').required()
    }),
    Assets.Config,
  ])
}

export default CheveretoAssets
