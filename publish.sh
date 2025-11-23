# To publish a new release, run the following commands:
# Modify the package.json to update the version
# Set the GITHUB_TOKEN environment variable with your GitHub token
# Then run this script 
yarn compile
npx vsce package --yarn

npx ovsx publish -p  <github_token>
