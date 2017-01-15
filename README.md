# http-aws4

[![npm](https://img.shields.io/npm/v/http-aws4.svg)](https://www.npmjs.com/package/http-aws4) [![Dependencies](https://img.shields.io/david/timdp/http-aws4.svg)](https://david-dm.org/timdp/http-aws4) [![JavaScript Standard Style](https://img.shields.io/badge/code%20style-standard-brightgreen.svg)](http://standardjs.com/)

Performs AWS Signature Version 4-signed HTTP requests from the command line.

## Installation

```bash
npm i -g http-aws4
```

## Usage

Perform a GET on an AWS Elasticsearch index:

```bash
haws https://ES-DOMAIN.us-east-1.es.amazonaws.com/INDEX-NAME
```

Delete the index:

```bash
haws delete https://ES-DOMAIN.us-east-1.es.amazonaws.com/INDEX-NAME
```

If the name of the AWS service and/or region cannot be detected from the URL,
you can set them manually using the `--service` and `--region` options.

## Author

[Tim De Pauw](https://github.com/timdp)

## License

MIT
