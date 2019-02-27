workflow "Build and test" {
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
