
import json, subprocess, sys

# Get current distribution config
result = subprocess.run(
    ['aws', 'cloudfront', 'get-distribution-config', '--id', 'E3TA4L9WKURJAP'],
    capture_output=True, text=True
)
data = json.loads(result.stdout)
etag   = data['ETag']
config = data['DistributionConfig']

# Add domain aliases
config['Aliases'] = {
    'Quantity': 2,
    'Items': ['stemnestacademy.co.uk', 'www.stemnestacademy.co.uk']
}

# Add SSL certificate
config['ViewerCertificate'] = {
    'CloudFrontDefaultCertificate': False,
    'ACMCertificateArn': 'arn:aws:acm:us-east-1:350202660449:certificate/aa54d7a9-664e-4964-96df-11130cf5b121',
    'SSLSupportMethod': 'sni-only',
    'MinimumProtocolVersion': 'TLSv1.2_2021'
}

# Save updated config
with open('cf-update.json', 'w') as f:
    json.dump(config, f, indent=2)

print('ETag:', etag)
print('Config saved to cf-update.json')
print('Now run:')
print(f'aws cloudfront update-distribution --id E3TA4L9WKURJAP --if-match {etag} --distribution-config file://cf-update.json')
