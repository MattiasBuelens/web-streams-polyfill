workflow "Test on push" {
  on = "push"
  resolves = ["Test"]
}

# GitHub Actions run as root, but by default `npm install` does not run lifecycle scripts when run as root
# Add --unsafe-perm option to allow it to lifecycle scripts
# See https://github.com/actions/npm/issues/27
action "Build" {
  uses = "actions/npm@master"
  args = ["install", "--unsafe-perm"]
}

action "Test" {
  uses = "actions/npm@master"
  needs = ["Build"]
  args = "test"
}

workflow "Test on pull request" {
  on = "pull_request"
  resolves = ["Test pull request"]
}

action "Check out pull request merge" {
  uses = "MattiasBuelens/checkout-pull-request-merge@v0.0.1"
  secrets = ["GITHUB_TOKEN"]
}

action "Build pull request" {
  uses = "actions/npm@master"
  needs = ["Check out pull request merge"]
  args = ["install", "--unsafe-perm"]
}

action "Test pull request" {
  uses = "actions/npm@master"
  needs = ["Build pull request"]
  args = "test"
}
