# To publish a new release, run the following commands:
# Modify the package.json to update the version
# Set the GITHUB_TOKEN environment variable with your GitHub token
# Then run this script 
yarn compile
npx vsce package --yarn

npx ovsx publish -p  ovsxp_a3e6ad0a-4128-4662-baf5-6f56734e73a5


#  Publish the release to github
# gh release create v0.0.53 aix-remote-ssh-0.0.53.vsix --title "AIX Remote SSH v0.0.53" --notes "Modified the readme"
gh release create v0.0.57 aix-remote-ssh-0.0.57.vsix --title "AIX Remote SSH v0.0.57" --notes ""