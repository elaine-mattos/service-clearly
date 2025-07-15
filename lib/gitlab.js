const { Gitlab } = require('@gitbeaker/rest')

module.exports = {
  getClient: function (options) {
    const gitlab = new Gitlab({
      token: options?.token
    })
    return gitlab
  }
}
