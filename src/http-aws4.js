#!/usr/bin/env node

const AWS = require('aws-sdk')
const normalizeUrl = require('normalize-url')
const lowercaseKeys = require('lowercase-keys')
const chalk = require('chalk')
const emphasize = require('emphasize')
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
  .version()
  .help()
  .options({
    print: {
      description: 'Parts of the request and response to output',
      alias: 'p',
      requiresArg: true,
      default: process.stdout.isTTY ? 'hb' : 'b',
      coerce: (val) => {
        if (!/^[HBhb]+$/.test(val)) {
          throw new Error('Allowed flags: HBhb')
        }
        return val
      }
    },
    pretty: {
      description: 'Output formatting',
      requiresArg: true,
      choices: ['all', 'colors', 'format', 'none'],
      default: process.stdout.isTTY ? 'all' : 'none'
    },
    region: {
      description: 'AWS region',
      alias: 'r',
      requiresArg: true,
      default: null,
      defaultDescription: '<auto>'
    },
    profile: {
      description: 'AWS profile',
      requiresArg: true,
      default: null,
      defaultDescription: '<auto>'
    },
    service: {
      description: 'AWS service name',
      alias: 's',
      requiresArg: true,
      default: null,
      defaultDescription: '<auto>'
    }
  })
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

service = argv.service
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

const indent = (blob) => {
  if (blob.type != null && /\bjson\b/.test(blob.type)) {
    try {
      return {
        data: JSON.stringify(JSON.parse(blob.data), null, 2),
        type: blob.type
      }
    } catch (err) {}
  }
  return blob
}

const highlight = (blob) => {
  // TODO Convert MIME type to highlight.js language
  if (blob.type != null && !/^text\/plain\b/.test(blob.type)) {
    try {
      return {
        data: emphasize.highlightAuto(blob.data).value,
        type: blob.type
      }
    } catch (err) {}
  }
  return blob
}

const buildReducers = () => {
  const reducers = []
  if (argv.pretty === 'all' || argv.pretty === 'format') {
    reducers.push(indent)
  }
  if (argv.pretty === 'all' || argv.pretty === 'colors') {
    reducers.push(highlight)
  }
  return reducers
}

const printHeaders = ({headers}, log) => {
  for (const name of Object.keys(headers || {}).sort()) {
    log(chalk.dim(`${name}: `) + headers[name])
  }
}

const printBody = ({headers, body}, log) => {
  if (body == null || body.length === 0) {
    log('')
    return
  }
  body = body.toString().trimRight()
  if (argv.pretty === 'none') {
    log(body)
    return
  }
  const reducers = buildReducers()
  const blob = {
    type: lowercaseKeys(headers)['content-type'],
    data: body
  }
  const {data} = reducers.reduce((prev, transform) => transform(prev), blob)
  log.bare(data)
}

const printMessage = (msg, line, headerFlag, bodyFlag, log) => {
  if (~argv.print.indexOf(headerFlag)) {
    log(chalk.bold(line))
    printHeaders(msg, log)
    log()
  }
  if (~argv.print.indexOf(bodyFlag)) {
    printBody(msg, log)
    log()
  }
}

const printRequestResponse = (req, resp, log) => {
  // TODO Determine HTTP version
  const reqLine = `${req.method} ${req.endpoint.href} HTTP/1.1`
  printMessage(req, reqLine, 'H', 'B', logger.log)
  const respLine = `HTTP/${resp.httpVersion} ${resp.statusCode} ${resp.statusMessage}`
  printMessage(resp, respLine, 'h', 'b', log)
}

const createRequest = (method, url, body, credentials) => {
  const endpoint = new AWS.Endpoint(url)
  const request = Object.assign(new AWS.HttpRequest(endpoint), {
    region,
    method,
    body
  })
  request.headers = Object.assign(
    lowercaseKeys(request.headers),
    {'user-agent': USER_AGENT},
    headers,
    {host: endpoint.host})
  const signer = new AWS.Signers.V4(request, service)
  signer.addAuthorization(credentials, new Date())
  return request
}

const handleResponse = (response) => new Promise((resolve, reject) => {
  response.setEncoding('utf8')
  const metadata = {
    httpVersion: response.httpVersion,
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

const getCredentials = (argv.profile != null)
  ? () => {
    const creds = new AWS.SharedIniFileCredentials({profile: argv.profile});
    return pify(creds.refresh).bind(creds)().then(() => creds);
  }
  : pify(config.getCredentials).bind(config)

const main = () => {
  let request
  return Promise.all([getStdin(), getCredentials()])
    .then(([body, credentials]) => {
      request = createRequest(method, url, body, credentials)
      return new Promise((resolve, reject) => {
        client.handleRequest(request, null, resolve, reject)
      })
    })
    .then(handleResponse)
    .catch((err) => {
      if (err.response != null) {
        printRequestResponse(request, err.response, logger.error)
        process.exit(1)
      } else {
        throw err
      }
    })
    .then((response) => {
      printRequestResponse(request, response, logger.info)
    })
}

main().catch((err) => {
  logger.error(cleanStack(err.stack))
  process.exit(254)
})
