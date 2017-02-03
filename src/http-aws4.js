#!/usr/bin/env node

const AWS = require('aws-sdk')
const normalizeUrl = require('normalize-url')
const cardinal = require('cardinal')
const chalk = require('chalk')
const cleanStack = require('clean-stack')
const getStdin = require('get-stdin')
const pify = require('pify')
const yargs = require('yargs')
const pkg = require('./package.json')

const USER_AGENT = `${pkg.name}/${pkg.version} (https://github.com/${pkg.repository})`

const CONSOLE_COLORS = [
  ['log', 'blue'],
  ['info', 'green'],
  ['warn', 'yellow'],
  ['error', 'red']
]

const argv = yargs
  .demand(1)
  .usage('Usage: $0 [options] [method] <url>')
  .string('region').alias('r', 'region')
  .string('service')
  .argv

const args = argv._
let service, method, url, region

if (/^\w+$/.test(args[0])) {
  method = args.shift().toUpperCase()
  url = args.shift()
} else {
  url = args.shift()
  method = 'GET'
}

url = normalizeUrl(url, {
  stripWWW: false,
  removeQueryParameters: null
})

region = argv.region
if (region == null) {
  region = /([a-z0-9-]+)\.\w+\.amazonaws\.com(?:\/|:|$)/i.exec(url)[1]
}

if (service == null) {
  service = /(\w+)\.amazonaws\.com(?:\/|:|$)/i.exec(url)[1]
}

const headers = {}
while (args.length > 0) {
  const arg = args.shift()
  const pos = arg.indexOf(':')
  headers[arg.substr(0, pos).toLowerCase()] = arg.substr(pos + 1)
}

const config = new AWS.Config({region})
const client = new AWS.NodeHttpClient()

const logger = CONSOLE_COLORS.reduce((logger, [fn, color]) => {
  const fmt = chalk[color]
  logger[fn] = (...args) => {
    console[fn].apply(console, args.map((arg) => fmt(arg)))
  }
  logger[fn].bare = (...args) => {
    console[fn].apply(console, args)
  }
  return logger
}, {})

const formatHeaders = (headers, type) => {
  for (const name of Object.keys(headers).sort()) {
    logger[type](`${name}: ${headers[name]}`)
  }
}

const formatResponse = (resp, type = 'info') => {
  logger[type](resp.statusCode + ' ' + resp.statusMessage)
  if (resp.headers) {
    formatHeaders(resp.headers, type)
  }
  logger[type]()
  let body = resp.body
  if (/\bjson\b/.test(resp.headers['content-type'])) {
    try {
      body = JSON.stringify(JSON.parse(body), null, 2)
      if (type !== 'error' && chalk.enabled) {
        logger[type].bare(cardinal.highlight(body))
        return
      }
    } catch (err) {}
  }
  logger[type]((body != null) ? body : '[empty response]')
}

const handleError = (err) => {
  if (err.response != null) {
    formatResponse(err.response, 'error')
  } else {
    logger.error(cleanStack(err.stack))
  }
  process.exit(1)
}

const normalizeHeaders = (headers) => {
  const names = Object.keys(headers)
  for (let i = 0; i < names.length; ++i) {
    const name = names[i]
    const nameLower = name.toLowerCase()
    if (name !== nameLower) {
      headers[nameLower] = headers[name]
      delete headers[name]
    }
  }
}

const createRequest = (method, url, body, credentials) => {
  const endpoint = new AWS.Endpoint(url)
  const request = Object.assign(new AWS.HttpRequest(endpoint), {
    region,
    method,
    body
  })
  normalizeHeaders(request.headers)
  Object.assign(request.headers,
    {'user-agent': USER_AGENT},
    headers,
    {host: endpoint.host})
  const signer = new AWS.Signers.V4(request, service)
  signer.addAuthorization(credentials, new Date())
  return request
}

const handleRequest = (request) => new Promise((resolve, reject) => {
  logger.log(request.method + ' ' + request.endpoint.href)
  formatHeaders(request.headers, 'log')
  logger.log()
  client.handleRequest(request, null, resolve, reject)
})

const handleResponse = (response) => new Promise((resolve, reject) => {
  response.setEncoding('utf8')
  const metadata = {
    statusCode: response.statusCode,
    statusMessage: response.statusMessage,
    headers: response.headers,
    body: ''
  }
  response.on('data', (data) => {
    metadata.body += data
  })
  response.on('end', () => {
    if (metadata.statusCode < 200 || metadata.statusCode >= 300) {
      const error = new Error()
      error.response = metadata
      reject(error)
    } else {
      resolve(metadata)
    }
  })
  response.on('error', reject)
})

const getCredentials = pify(config.getCredentials).bind(config)

Promise.all([getStdin(), getCredentials()])
  .then(([body, credentials]) => {
    const request = createRequest(method, url, body, credentials)
    return handleRequest(request)
  })
  .then(handleResponse)
  .then(formatResponse)
  .catch(handleError)
