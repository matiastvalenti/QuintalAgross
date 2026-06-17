import urllib.request
import certifi
import ssl

url = 'https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ8Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpbCiVodG1sXzAwMDY0ZGNiOGMzOWY3MTcwMWE2MGU0OTdmMjcxOTJlEgsSBxDRhNnIvRAYAZIBJAoKcHJvamVjdF9pZBIWQhQxMzIzNTM2MTU5NTU1NTA5NzkyNw&filename=&opi=89354086'
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
context = ssl.create_default_context(cafile=certifi.where())

with urllib.request.urlopen(req, context=context) as response:
    html = response.read()
    with open('original.html', 'wb') as f:
        f.write(html)
