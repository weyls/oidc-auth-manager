'use strict'

const url = require('url')

class AuthCallbackRequest {
  constructor (options) {
    this.requestUri = options.requestUri
    this.issuer = options.issuer
    this.oidcManager = options.oidcManager
    this.response = options.response
    this.session = options.session
    this.serverUri = options.serverUri
    this.debug = options.debug || console.log.bind(console)
  }

  /**
   * Usage:
   *
   *   ```
   *   router.get('/api/oidc/rp/:issuer_id', AuthCallbackRequest.get)
   *   ```
   *
   * @param req
   * @param res
   * @param next
   *
   * @returns {Promise}
   */
  static get (req, res, next) {
    const request = AuthCallbackRequest.fromParams(req, res)

    return AuthCallbackRequest.handle(request)
      .catch(next)
  }

  /**
   * Factory method, creates and returns an initialized and validated instance
   * of AuthCallbackRequest from a redirected GET request.
   *
   * @param req {IncomingRequest}
   *
   * @param res {ServerResponse}

   * @return {AuthCallbackRequest}
   */
  static fromParams (req, res) {
    let oidcManager, serverUri
    if (req.app && req.app.locals) {
      let locals = req.app.locals
      oidcManager = locals.oidc
      serverUri = locals.host.serverUri
    }

    let requestUri = url.format({
      protocol: req.protocol,
      host: req.get('host'),
      pathname: req.path,
      query: req.query
    })

    let issuer = AuthCallbackRequest.extractIssuer(req)

    let options = {
      issuer,
      requestUri,
      oidcManager,
      serverUri,
      response: res,
      session: req.session
    }

    let request = new AuthCallbackRequest(options)

    return request
  }

  // Exchange authorization code for id token
  static handle (request) {
    return Promise.resolve()
      .then(() => request.validate())
      .then(() => request.loadClient())
      .then(rpClient => request.validateResponse(rpClient))
      .then(authResponse => request.initSessionUserAuth(authResponse))
      .then(() => request.resumeUserWorkflow())
  }

  static extractIssuer (req) {
    return req.params && decodeURIComponent(req.params.issuer_id)
  }

  static extractWebId (authResponse) {
    return authResponse.decoded.payload.sub
  }

  validate () {
    if (!this.issuer) {
      let error = new Error('Issuer id is missing from request params')
      error.statusCode = 400
      throw error
    }
  }

  loadClient () {
    let rpClientStore = this.oidcManager.clients

    return rpClientStore.clientForIssuer(this.issuer)
  }

  initSessionUserAuth (authResponse) {
    this.session.accessToken = authResponse.params.access_token
    this.session.refreshToken = authResponse.params.refresh_token

    let claims = authResponse.decoded.payload
    let webId = this.oidcManager.webIdFromClaims(claims)

    this.session.userId = webId
    this.session.identified = true
  }

  validateResponse (client) {
    return client.validateResponse(this.requestUri, this.session)
  }

  /**
   * Redirects the user back to their original requested resource, at the end
   * of the OIDC authentication process.
   * @method resumeUserFlow
   */
  resumeUserWorkflow (req, res) {
    this.debug('In resumeUserFlow handler:')

    let session = this.session
    if (session.returnToUrl) {
      let returnToUrl = session.returnToUrl
      // if (req.session.accessToken) {
      //   returnToUrl += '?access_token=' + req.session.accessToken
      // }
      this.debug('  Redirecting to ' + returnToUrl)
      delete session.returnToUrl
      return this.response.redirect(302, returnToUrl)
    }
    this.response.send('Resume User Flow (failed)')
  }
}

module.exports = AuthCallbackRequest
