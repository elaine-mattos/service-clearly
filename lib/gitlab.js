const { Gitlab } = require('@gitbeaker/rest')
const { defaultHeaders } = require('./fetch')

module.exports = {
  getClient: function (options) {
    const gitlab = new Gitlab({
      token: options?.token
    })
    return gitlab
  }
}
