#!/bin/sh

set -x

echo 'Zipping the Alexa Skill'
cd src
rm Archive.zip
zip -r Archive.zip index.js node_modules
cd ..
echo 'Zip Created'
echo 'Deploying App'
aws lambda update-function-code --function-name $FUNCTION_NAME --zip-file fileb://src/Archive.zip
