export interface AuthUser {
  username: string
  nickname?: string
  email?: string
  access_token?: string
  token?: string
  [key: string]: unknown
}
