import http from '~/api/http'

export const userAuth = {
  register(data: unknown) {
    return http.post('/user/register', data)
  },

  /** POST /user/login，用户名 + 密码 */
  login(data: unknown) {
    return http.post('/user/login', data)
  },

  /** GET /user/logout */
  logout() {
    return http.get('/user/logout')
  },
}

export default userAuth
