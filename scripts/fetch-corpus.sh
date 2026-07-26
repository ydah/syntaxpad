#!/bin/sh
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
destination="$repo_root/fixtures/external"
ruby_commit="97d602a55f9e77bd64c2130dc0a755f657b4ce65"
source_url="https://raw.githubusercontent.com/ruby/ruby/$ruby_commit/parse.y"
license_url="https://raw.githubusercontent.com/ruby/ruby/$ruby_commit/COPYING"

mkdir -p "$destination"
curl --fail --location --silent --show-error "$source_url" --output "$destination/cruby-parse.y"
curl --fail --location --silent --show-error "$license_url" --output "$destination/CRUBY-COPYING"

{
  echo "source=$source_url"
  echo "commit=$ruby_commit"
  echo "license=$license_url"
} >"$destination/cruby-parse.metadata"
