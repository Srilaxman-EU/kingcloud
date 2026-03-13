/**
 * KingCloud - Storj DCS S3-Compatible Client
 * Implements minimal AWS Signature V4 for List, PUT, GET, DELETE, COPY.
 * All credentials are read from localStorage via Auth.getStorjCreds().
 * Never hardcodes secrets.
 *
 * CORS NOTE: In your Storj bucket settings you must add a CORS rule:
 *   AllowedOrigins: ["*"] (or your specific domain)
 *   AllowedMethods: ["GET","PUT","DELETE","HEAD"]
 *   AllowedHeaders: ["*"]
 *   ExposeHeaders:  ["ETag","Content-Length","Content-Type"]
 */

const StorjClient = (() => {

  // ── Utility: hex encode ──────────────────────────────────────────────────
  function buf2hex(buffer) {
    return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // ── SHA-256 digest ───────────────────────────────────────────────────────
  async function sha256(message) {
    const msgBuf = (typeof message === 'string') ? new TextEncoder().encode(message) : message;
    return buf2hex(await crypto.subtle.digest('SHA-256', msgBuf));
  }

  // ── HMAC-SHA256 ──────────────────────────────────────────────────────────
  async function hmacSHA256(key, data) {
    const keyBuf  = (typeof key  === 'string') ? new TextEncoder().encode(key)  : key;
    const dataBuf = (typeof data === 'string') ? new TextEncoder().encode(data) : data;
    const cryptoKey = await crypto.subtle.importKey(
      'raw', keyBuf, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, dataBuf));
  }

  // ── Derive signing key ───────────────────────────────────────────────────
  async function getSigningKey(secretKey, dateStamp, region, service) {
    const kDate    = await hmacSHA256('AWS4' + secretKey, dateStamp);
    const kRegion  = await hmacSHA256(kDate, region);
    const kService = await hmacSHA256(kRegion, service);
    const kSigning = await hmacSHA256(kService, 'aws4_request');
    return kSigning;
  }

  // ── ISO date helpers ─────────────────────────────────────────────────────
  function getAmzDate(d) {
    return d.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z';
  }
  function getDateStamp(d) {
    return d.toISOString().slice(0, 10).replace(/-/g, '');
  }

  // ── URL-safe encode (RFC 3986, allow forward slashes when double=false) ──
  function uriEncode(str, encodeSlash = true) {
    return encodeURIComponent(str).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())
      .replace(/%2F/g, encodeSlash ? '%2F' : '/');
  }

  // ── Sign and execute a request ───────────────────────────────────────────
  async function signedRequest({ method, endpoint, bucket, key = '', queryParams = {}, headers = {}, body = null, creds }) {
    const service = 's3';
    const region  = creds.region || 'us-east-1';

    const now       = new Date();
    const amzDate   = getAmzDate(now);
    const dateStamp = getDateStamp(now);

    // Build canonical URI: /<bucket>/<key>
    let canonicalUri = `/${bucket}`;
    if (key) canonicalUri += '/' + key.split('/').map(seg => uriEncode(seg)).join('/');

    // Canonical query string (sorted keys)
    const sortedQuery = Object.keys(queryParams).sort().map(k =>
      uriEncode(k) + '=' + uriEncode(queryParams[k])
    ).join('&');

    // Payload hash
    const payloadBody   = body || '';
    const payloadHash   = (body instanceof ArrayBuffer || ArrayBuffer.isView(body))
      ? await sha256(body)
      : await sha256(typeof body === 'string' ? body : '');

    // Build canonical headers (lowercase, sorted)
    const host = new URL(endpoint).host;
    const allHeaders = {
      host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      ...Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]))
    };
    const sortedHeaderKeys = Object.keys(allHeaders).sort();
    const canonicalHeaders = sortedHeaderKeys.map(k => k + ':' + allHeaders[k].trim()).join('\n') + '\n';
    const signedHeaders    = sortedHeaderKeys.join(';');

    const canonicalRequest = [
      method, canonicalUri, sortedQuery, canonicalHeaders, signedHeaders, payloadHash
    ].join('\n');

    const credScope    = `${dateStamp}/${region}/${service}/aws4_request`;
    const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credScope}\n${await sha256(canonicalRequest)}`;

    const signingKey = await getSigningKey(creds.secretKey, dateStamp, region, service);
    const signature  = buf2hex(await hmacSHA256(signingKey, stringToSign));

    const authorization = `AWS4-HMAC-SHA256 Credential=${creds.accessKey}/${credScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const url = endpoint.replace(/\/$/, '') + canonicalUri + (sortedQuery ? '?' + sortedQuery : '');

    const reqHeaders = {
      Authorization: authorization,
      'x-amz-date': amzDate,
      'x-amz-content-sha256': payloadHash,
      ...headers
    };

    return fetch(url, {
      method,
      headers: reqHeaders,
      body: (method === 'GET' || method === 'HEAD' || method === 'DELETE') ? undefined : body
    });
  }

  // ── Get credentials or throw ─────────────────────────────────────────────
  function getCreds() {
    if (typeof Auth === 'undefined') throw new Error('Auth module not loaded.');
    const c = Auth.getStorjCreds();
    if (!c || !c.accessKey || !c.secretKey || !c.endpoint || !c.bucket) {
      throw new Error('Storj credentials not configured. Please visit Settings → Storage.');
    }
    return c;
  }

  // ── List objects ─────────────────────────────────────────────────────────
  async function listObjects(prefix = '') {
    const creds = getCreds();
    const params = { 'list-type': '2', 'max-keys': '1000' };
    if (prefix) params.prefix = prefix;

    const res = await signedRequest({
      method: 'GET', endpoint: creds.endpoint, bucket: creds.bucket,
      queryParams: params, creds
    });
    if (!res.ok) throw new Error(`List failed: ${res.status} ${res.statusText}`);

    const xml  = await res.text();
    const parser = new DOMParser();
    const doc  = parser.parseFromString(xml, 'text/xml');
    const items = [];

    doc.querySelectorAll('Contents').forEach(el => {
      const key          = el.querySelector('Key')?.textContent || '';
      const size         = parseInt(el.querySelector('Size')?.textContent || '0', 10);
      const lastModified = el.querySelector('LastModified')?.textContent || '';
      const etag         = (el.querySelector('ETag')?.textContent || '').replace(/"/g, '');
      items.push({ key, size, lastModified: new Date(lastModified), etag });
    });

    return items;
  }

  // ── Upload ───────────────────────────────────────────────────────────────
  async function uploadObject(key, file, onProgress) {
    const creds = getCreds();

    // Use XMLHttpRequest for progress events
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const service = 's3';
      const region  = creds.region || 'us-east-1';
      const now       = new Date();
      const amzDate   = getAmzDate(now);
      const dateStamp = getDateStamp(now);

      // We pre-sign with UNSIGNED-PAYLOAD for binary uploads
      const encodedKey = key.split('/').map(seg => uriEncode(seg)).join('/');
      const url = `${creds.endpoint.replace(/\/$/, '')}/${creds.bucket}/${encodedKey}`;

      xhr.open('PUT', url, true);
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');

      // For XHR uploads we use a pre-signed approach with UNSIGNED-PAYLOAD
      const host = new URL(creds.endpoint).host;

      // Build signature synchronously is not possible; use async chain before open
      // We'll sign and then open again
      xhr.abort();

      async function doUpload() {
        const payloadHash   = 'UNSIGNED-PAYLOAD';
        const contentType   = file.type || 'application/octet-stream';
        const allHeaders = {
          'content-type': contentType,
          host,
          'x-amz-content-sha256': payloadHash,
          'x-amz-date': amzDate
        };
        const sortedKeys       = Object.keys(allHeaders).sort();
        const canonicalHeaders = sortedKeys.map(k => k + ':' + allHeaders[k].trim()).join('\n') + '\n';
        const signedHeaders    = sortedKeys.join(';');
        const canonicalUri     = `/${creds.bucket}/${encodedKey}`;
        const canonicalRequest = ['PUT', canonicalUri, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
        const credScope        = `${dateStamp}/${region}/${service}/aws4_request`;
        const stringToSign     = `AWS4-HMAC-SHA256\n${amzDate}\n${credScope}\n${await sha256(canonicalRequest)}`;
        const signingKey       = await getSigningKey(creds.secretKey, dateStamp, region, service);
        const signature        = buf2hex(await hmacSHA256(signingKey, stringToSign));
        const authorization    = `AWS4-HMAC-SHA256 Credential=${creds.accessKey}/${credScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

        const xhr2 = new XMLHttpRequest();
        xhr2.open('PUT', url, true);
        xhr2.setRequestHeader('Authorization', authorization);
        xhr2.setRequestHeader('Content-Type', contentType);
        xhr2.setRequestHeader('x-amz-date', amzDate);
        xhr2.setRequestHeader('x-amz-content-sha256', payloadHash);

        if (onProgress) {
          xhr2.upload.onprogress = e => {
            if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
          };
        }

        xhr2.onload = () => {
          if (xhr2.status >= 200 && xhr2.status < 300) resolve();
          else reject(new Error(`Upload failed: ${xhr2.status} ${xhr2.statusText}\n${xhr2.responseText}`));
        };
        xhr2.onerror = () => reject(new Error('Upload network error'));
        xhr2.send(file);
      }

      doUpload().catch(reject);
    });
  }

  // ── Download (returns signed URL) ────────────────────────────────────────
  async function getDownloadUrl(key) {
    const creds  = getCreds();
    const region = creds.region || 'us-east-1';
    const service = 's3';
    const now       = new Date();
    const amzDate   = getAmzDate(now);
    const dateStamp = getDateStamp(now);
    const expires   = '3600'; // 1 hour

    const encodedKey   = key.split('/').map(seg => uriEncode(seg)).join('/');
    const canonicalUri = `/${creds.bucket}/${encodedKey}`;
    const host         = new URL(creds.endpoint).host;
    const credScope    = `${dateStamp}/${region}/${service}/aws4_request`;

    const queryParams = {
      'X-Amz-Algorithm':     'AWS4-HMAC-SHA256',
      'X-Amz-Credential':    `${creds.accessKey}/${credScope}`,
      'X-Amz-Date':          amzDate,
      'X-Amz-Expires':       expires,
      'X-Amz-SignedHeaders': 'host'
    };

    const sortedQuery      = Object.keys(queryParams).sort().map(k => uriEncode(k) + '=' + uriEncode(queryParams[k])).join('&');
    const canonicalHeaders = `host:${host}\n`;
    const signedHeaders    = 'host';
    const canonicalRequest = ['GET', canonicalUri, sortedQuery, canonicalHeaders, signedHeaders, 'UNSIGNED-PAYLOAD'].join('\n');
    const stringToSign     = `AWS4-HMAC-SHA256\n${amzDate}\n${credScope}\n${await sha256(canonicalRequest)}`;
    const signingKey       = await getSigningKey(creds.secretKey, dateStamp, region, service);
    const signature        = buf2hex(await hmacSHA256(signingKey, stringToSign));

    return `${creds.endpoint.replace(/\/$/, '')}${canonicalUri}?${sortedQuery}&X-Amz-Signature=${signature}`;
  }

  // ── Delete ───────────────────────────────────────────────────────────────
  async function deleteObject(key) {
    const creds = getCreds();
    const res = await signedRequest({
      method: 'DELETE', endpoint: creds.endpoint, bucket: creds.bucket, key, creds
    });
    if (!res.ok && res.status !== 204) throw new Error(`Delete failed: ${res.status} ${res.statusText}`);
  }

  // ── Rename (copy + delete) ────────────────────────────────────────────────
  async function renameObject(oldKey, newKey) {
    const creds = getCreds();
    const copySource = `/${creds.bucket}/${oldKey}`;
    const res = await signedRequest({
      method: 'PUT', endpoint: creds.endpoint, bucket: creds.bucket, key: newKey,
      headers: {
        'x-amz-copy-source': encodeURIComponent(copySource).replace(/%2F/g, '/')
      },
      creds
    });
    if (!res.ok) throw new Error(`Rename (copy) failed: ${res.status} ${res.statusText}`);
    await deleteObject(oldKey);
  }

  // ── Test connection ───────────────────────────────────────────────────────
  async function testConnection(customCreds) {
    const creds = customCreds || getCreds();
    try {
      const params = { 'list-type': '2', 'max-keys': '1' };
      const res = await signedRequest({
        method: 'GET', endpoint: creds.endpoint, bucket: creds.bucket,
        queryParams: params, creds
      });
      if (res.ok || res.status === 200) return { ok: true };
      const text = await res.text();
      return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 200)}` };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  // ── Format file size ──────────────────────────────────────────────────────
  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(i > 1 ? 2 : 0)) + ' ' + sizes[i];
  }

  // ── Detect file type icon ─────────────────────────────────────────────────
  function getFileIcon(filename) {
    const ext = (filename.split('.').pop() || '').toLowerCase();
    const map = {
      jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', webp: '🖼️', svg: '🖼️', bmp: '🖼️', ico: '🖼️',
      mp4: '🎬', mov: '🎬', avi: '🎬', mkv: '🎬', webm: '🎬',
      mp3: '🎵', wav: '🎵', ogg: '🎵', flac: '🎵', m4a: '🎵',
      pdf: '📄', doc: '📝', docx: '📝', txt: '📄', md: '📄', rtf: '📄',
      xls: '📊', xlsx: '📊', csv: '📊',
      ppt: '📽️', pptx: '📽️',
      zip: '🗜️', rar: '🗜️', '7z': '🗜️', tar: '🗜️', gz: '🗜️',
      js: '💻', ts: '💻', html: '💻', css: '💻', py: '💻', java: '💻', cpp: '💻', c: '💻', go: '💻', rs: '💻',
      json: '💻', xml: '💻', yaml: '💻', yml: '💻',
      exe: '⚙️', dmg: '⚙️', pkg: '⚙️', deb: '⚙️', apk: '⚙️',
      ttf: '🔤', otf: '🔤', woff: '🔤', woff2: '🔤'
    };
    return map[ext] || '📁';
  }

  // ── Detect CSS class for file type ────────────────────────────────────────
  function getFileTypeClass(filename) {
    const ext = (filename.split('.').pop() || '').toLowerCase();
    if (['jpg','jpeg','png','gif','webp','svg','bmp','ico'].includes(ext)) return 'ft-image';
    if (['mp4','mov','avi','mkv','webm'].includes(ext)) return 'ft-video';
    if (['mp3','wav','ogg','flac','m4a'].includes(ext)) return 'ft-audio';
    if (['doc','docx','txt','md','rtf','pdf'].includes(ext)) return ext === 'pdf' ? 'ft-pdf' : 'ft-doc';
    if (['xls','xlsx','csv'].includes(ext)) return 'ft-sheet';
    if (['zip','rar','7z','tar','gz'].includes(ext)) return 'ft-zip';
    if (['js','ts','html','css','py','java','cpp','c','go','rs','json','xml','yaml','yml'].includes(ext)) return 'ft-code';
    return 'ft-other';
  }

  return {
    listObjects, uploadObject, getDownloadUrl, deleteObject, renameObject,
    testConnection, formatSize, getFileIcon, getFileTypeClass
  };
})();
