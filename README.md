# http-aws4

[![npm](https://img.shields.io/npm/v/http-aws4.svg)](https://www.npmjs.com/package/http-aws4) [![Dependencies](https://img.shields.io/david/timdp/http-aws4.svg)](https://david-dm.org/timdp/http-aws4) [![JavaScript Standard Style](https://img.shields.io/badge/code%20style-standard-brightgreen.svg)](http://standardjs.com/)

Performs AWS Signature Version 4-signed HTTP requests from the command line.

Inspired by the awesome [HTTPie](https://httpie.org/).

## Installation

```bash
npm i -g http-aws4
```

## Usage

Perform a GET on your AWS Elasticsearch index called `blog`:

```bash
haws https://search-....us-east-1.es.amazonaws.com/blog
```

Delete the `blog` index:

```bash
haws delete https://search-....us-east-1.es.amazonaws.com/blog
```

## Options

### --print FLAGS, -p FLAGS

Controls which parts of the requests are output. Allowed flags:

| Flag | Meaning          |
|:----:|------------------|
| `H`  | Request headers  |
| `B`  | Request body     |
| `h`  | Response headers |
| `b`  | Response body |

For example, `-p Hhb` would print the request headers, the response headers, and
the response body.

The default value is `hb`, meaning the response headers and response body.

### --region REGION, -r REGION

If the name of the AWS region cannot be detected from the URL, use this option
to set it manually.

### --service SERVICE, -s SERVICE

If the name of the AWS service cannot be detected from the URL, use this option
to set it manually.

### --no-color

If you prefer not to colorize the output, pass this option, provided by
[supports-color](https://www.npmjs.com/package/supports-color).

## Request Headers

Request headers can be specified after the URL as a space-separated list of
name-value pairs, separated by a colon character. For example, this command
would set the `X-Foo` header to `bar`, and the `X-Baz` header to `quux`:

```bash
haws https://... x-foo:bar x-baz:quux
```

## Request Body

The process's standard input will be used as the request body. For example, if
you have prepared an Elasticsearch bulk API request body in `body.json`, you
can post it as follows:

```bash
haws post https://search-....us-east-1.es.amazonaws.com/_bulk <body.json
```

## Author

[Tim De Pauw](https://github.com/timdp)

## License

MIT
