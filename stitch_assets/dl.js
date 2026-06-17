import https from 'https';
import fs from 'fs';

const url = 'https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ8Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpbCiVodG1sXzAwMDY0ZGNiOGMzOWY3MTcwMWE2MGU0OTdmMjcxOTJlEgsSBxDRhNnIvRAYAZIBJAoKcHJvamVjdF9pZBIWQhQxMzIzNTM2MTU5NTU1NTA5NzkyNw&filename=&opi=89354086';
https.get(url, (res) => {
  let body = '';
  res.on('data', (d) => body += d);
  res.on('end', () => fs.writeFileSync('c:\\Users\\matia\\Cosas\\Escritorio\\Programacion\\Otro\\QuintalAgross_Back\\stitch_assets\\original.html', body));
});
