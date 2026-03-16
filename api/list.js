'use strict';

const fetch = require('node-fetch');
const crypto = require('crypto');

exports.handler = async (event) => {
    const token = event.headers.Authorization && event.headers.Authorization.split(' ')[1];
    if (token !== process.env.KINGCLOUD_API_TOKEN) {
        return { statusCode: 403, body: JSON.stringify({ message: 'Forbidden' }) };
    }

    const STORJ_ENDPOINT = process.env.STORJ_ENDPOINT;
    const STORJ_ACCESS_KEY = process.env.STORJ_ACCESS_KEY;
    const STORJ_SECRET_KEY = process.env.STORJ_SECRET_KEY;
    const STORJ_BUCKET = process.env.STORJ_BUCKET;
    const STORJ_REGION = process.env.STORJ_REGION;

    const endpoint = `${STORJ_ENDPOINT}/${STORJ_BUCKET}?list-type=2`;
    const date = new Date().toUTCString();

    // Function to create AWS Signature V4 headers
    const createSignature = (key, dateStamp, regionName, serviceName, stringToSign) => {
        const kDate = crypto.createHmac('sha256', 'AWS4' + key).update(dateStamp).digest();
        const kRegion = crypto.createHmac('sha256', kDate).update(regionName).digest();
        const kService = crypto.createHmac('sha256', kRegion).update(serviceName).digest();
        const kSigning = crypto.createHmac('sha256', kService).update('aws4_request').digest();
        return kSigning;
    };

    // Function to fetch objects from Storj
    const fetchObjects = async () => {
        const dateStamp = new Date().toISOString().split('T')[0].replace(/-/g, '');
        const canonicalUri = '/' + STORJ_BUCKET;
        const canonicalQuerystring = 'list-type=2';
        const canonicalHeaders = `host:${STORJ_ENDPOINT}\n`;
        const signedHeaders = 'host';

        const canonicalRequest = `GET\n${canonicalUri}\n${canonicalQuerystring}\n${canonicalHeaders}\n${signedHeaders}\nUNSIGNED-PAYLOAD`;
        const stringToSign = `AWS4-HMAC-SHA256\n${date}\n${dateStamp}/${STORJ_REGION}/s3/aws4_request\n${crypto.createHash('sha256').update(canonicalRequest).digest('hex')}`;
        const signingKey = createSignature(STORJ_SECRET_KEY, dateStamp, STORJ_REGION, 's3', stringToSign);
        const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');

        const response = await fetch(`${endpoint}&X-Amz-Signature=${signature}`, {
            method: 'GET',
            headers: {
                'Authorization': `AWS4-HMAC-SHA256 Credential=${STORJ_ACCESS_KEY}/${dateStamp}/${STORJ_REGION}/s3/aws4_request, SignedHeaders=${signedHeaders}, Signature=${signature}`,
                'x-amz-date': date
            }
        });
        return response.json();
    };

    try {
        const data = await fetchObjects();
        const result = data.Contents.map(item => ({
            key: item.Key,
            size: item.Size,
            lastModified: item.LastModified,
            etag: item.ETag
        }));
        return { statusCode: 200, body: JSON.stringify(result) };
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ message: 'Error fetching objects', error: error.message }) };
    }
};