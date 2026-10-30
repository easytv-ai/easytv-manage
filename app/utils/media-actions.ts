/**
 * 画布媒体动作清单，与后端媒体动作列表一致。
 * MediaActionsDisabled 存逗号分隔的小写 id；空=全开。未知 id 保存时原样保留，避免冲掉新动作。
 */

export const MEDIA_ACTION_GROUPS = [
  {
    id: 'local' as const,
    actions: [
      'crop',
      'grid_split',
      'montage',
      'trim',
      'split',
      'extract_audio',
      'mute_video',
      'mix_bgm',
      'split_av',
      'extract_frame',
      'extract_frames',
      'storyboard',
      'remove_silence',
      'compress',
    ],
  },
  {
    id: 'model' as const,
    actions: [
      'upscale',
      'remove_subtitle',
      'vocal_separation',
      'bgm_separation',
      'matting',
      'subject_remove',
      'subject_modify',
      'subject_replace',
      'motion_capture',
      'depth_extract',
      'transcribe',
    ],
  },
  {
    id: 'existing' as const,
    actions: [
      'retake_segment',
      'retake',
      'extend',
      'regenerate',
      'compose',
    ],
  },
]

export const MEDIA_ACTION_KEYS = MEDIA_ACTION_GROUPS.flatMap(group => group.actions)

export const DEFAULT_MEDIA_JOB_MAX_QUEUE = '20'
export const DEFAULT_MEDIA_JOB_MAX_PER_USER = '3'

export function parseMediaActionsDisabled(raw: unknown): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of String(raw ?? '').split(',')) {
    const value = part.trim().toLowerCase()
    if (!value || seen.has(value))
      continue
    seen.add(value)
    out.push(value)
  }
  return out
}

export function extraDisabledActions(disabled: Iterable<string>): string[] {
  const known = new Set(MEDIA_ACTION_KEYS)
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of disabled) {
    const value = item.trim().toLowerCase()
    if (!value || known.has(value) || seen.has(value))
      continue
    seen.add(value)
    out.push(value)
  }
  return out
}

export function enabledMapFromDisabled(disabled: Iterable<string>): Record<string, boolean> {
  const set = new Set([...disabled].map(item => item.trim().toLowerCase()).filter(Boolean))
  const out: Record<string, boolean> = {}
  for (const key of MEDIA_ACTION_KEYS)
    out[key] = !set.has(key)
  return out
}

export function serializeMediaActionsDisabled(
  enabled: Record<string, boolean>,
  extras: Iterable<string> = [],
): string {
  const seen = new Set<string>()
  const out: string[] = []
  for (const key of MEDIA_ACTION_KEYS) {
    if (enabled[key] !== false || seen.has(key))
      continue
    seen.add(key)
    out.push(key)
  }
  for (const extra of extras) {
    const value = extra.trim().toLowerCase()
    if (!value || seen.has(value))
      continue
    seen.add(value)
    out.push(value)
  }
  return out.join(',')
}

export type MediaActionCoverage = {
  action: string
  engine?: string
  ability?: string
  available?: boolean
  reason?: string
  models?: string[]
  priced_models?: string[]
  gap?: string
}

export function coverageByAction(list: MediaActionCoverage[] | null | undefined): Record<string, MediaActionCoverage> {
  const out: Record<string, MediaActionCoverage> = {}
  for (const item of list ?? []) {
    const key = String(item?.action ?? '').trim()
    if (!key)
      continue
    out[key] = item
  }
  return out
}

export function modelEngineCoverage(list: MediaActionCoverage[] | null | undefined): MediaActionCoverage[] {
  return (list ?? []).filter(item => item.engine === 'model')
}

export function mediaSettingEntries(payload: {
  disabledValue: string
  maxQueue: string
  maxPerUser: string
  ffmpegPath: string
  ffprobePath: string
}) {
  return [
    { key: 'MediaActionsDisabled', value: payload.disabledValue },
    { key: 'MediaJobMaxQueue', value: payload.maxQueue },
    { key: 'MediaJobMaxPerUser', value: payload.maxPerUser },
    { key: 'FFmpegPath', value: payload.ffmpegPath },
    { key: 'FFprobePath', value: payload.ffprobePath },
  ]
}
