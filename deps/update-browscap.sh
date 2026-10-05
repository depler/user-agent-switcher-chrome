#!/bin/sh
# Ensure that we are in the correct working directory
cd "$(dirname "$(readlink -f "${0}")")"

# Regenerate the Browcap JavaScrpt bundle
browserify \
	-r ./browscap-js-cache-fetch:browscap-js-cache \
	-r ./browscap/md5:md5 \
	-r ./browscap/charenc:charenc \
	-r ./browscap/crypt:crypt \
	-r ./browscap/is-buffer:is-buffer \
	-r ./browscap/synchronous-promise:synchronous-promise \
	-r ./browscap/browscap-js/src:browscap \
	-o browscap.js

# Slowness beyond this point
while true;
do
	read -p "Would you like to regenerate the BrowsCap JSON cache? [Y/N] " RESP
	if [ "${RESP}" = "Y" ] || [ "${RESP}" = "y" ];
	then
		break
	elif [ "${RESP}" = "N" ] || [ "${RESP}" = "n" ];
	then
		exit
	fi
done

if ! [ -d "browscap-json-generator" ];
then
	git clone "https://gitlab.com/ntninja/user-agent-switcher-browscap-json-generator.git" "browscap-json-generator"
else
	echo -n; #git --git-dir="browscap-json-generator" clean -xdf
	#git --git-dir="browscap-json-generator" pull
fi

# Install BrowscapJSONGenerator dependecies
composer --working-dir="browscap-json-generator" install

# Patch source code to generate only two levels of cache keys instead of three …
sed -ri 's/return\s+\$string\[0\]\s*.\s*\$string\[1\]\s*.\s*\$string\[2\];/return $string[0] . $string[1] . "";/g'                   "browscap-json-generator/vendor/browscap/browscap-php/src/Parser/Helper/SubKey.php"
sed -ri 's/\$subKeys\[\]\s*=\s*\$charOne\s*.\s*\$charTwo\s*.\s*\$charThree;/$subKeys[] = $charOne . $charTwo . ""; break;/g' "browscap-json-generator/vendor/browscap/browscap-php/src/Parser/Helper/SubKey.php"

# … and one level of patterns instead of two
sed -ri 's/return\s+\$string\[0\]\s*.\s*\$string\[1\];/return $string[0] . "";/g'                       "browscap-json-generator/vendor/browscap/browscap-php/src/Parser/Helper/SubKey.php"
sed -ri 's/\$subkeys\[\$charOne\s*.\s*\$charTwo\]\s*=\s*'"''"';/$subkeys[$charOne . ""] = ""; break;/g' "browscap-json-generator/vendor/browscap/browscap-php/src/Parser/Helper/SubKey.php"

# Build BrowsCap JSON cache
rm -rf "browscap-json-cache-files" ||:
php -f "browscap-json-generator/bin/browscap-with-json" build -vv --output="../browscap-json-cache-files"
mv "browscap-json-cache-files"/build-* "browscap-json-cache-files/build"
rm -rf "browscap-json-cache-files/build/test"
rm -rf "browscap-json-cache-files/build/cache"
rm -rf "browscap-json-cache-files/build"/*.ini