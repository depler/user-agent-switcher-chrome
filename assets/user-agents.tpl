#Note: Browser version data is semi-regularily updated based on the version data
#      available through WikiData's SPARQL data service
#      (See `assets/user-agents.tpl` in the source for the queries involved.)
?# Latest Firefox version on Windows 11 (same as Windows 10) and Ubuntu 22.04LTS x86-64
?#
?# Starting with Firefox 109 to 119 the Gecko version has now been frozen, but this has
?# not been documented anywhere, also the minor version is always 0 even though
?# it is technically present (discovered by user @sp1cyf0x): 
?# https://gitlab.com/ntninja/user-agent-switcher/-/issues/108
?=firefox as version[split(".")]
?+	SELECT
?+		?version
?+	WHERE {
?+		wd:Q698 p:P348 ?versionStmt.
?+      ?versionStmt ps:P348 ?version.
?+      ?versionStmt pq:P577 ?publicationDate.
?+      ?versionStmt pq:P548 wd:Q2804309.
?+	}
?+  ORDER BY
?+      DESC(?publicationDate)
?+  LIMIT
?+      1
Windows / Firefox {firefox[0]} [Desktop]: Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:{firefox[0]}.0) Gecko/20100101 Firefox/{firefox[0]}.0
Linux / Firefox {firefox[0]} [Desktop]: Mozilla/5.0 (X11; Linux x86_64; rv:{firefox[0]}.0) Gecko/20100101 Firefox/{firefox[0]}.0
?#
?# Latest Desktop Safari version on latest macOS x86-64
?#  – The Safari and WebKit tokens are frozen and therefor irrelevant.
?=safari as version[split(".")]
?+	SELECT
?+		?version
?+	WHERE {
?+		wd:Q35773 p:P348 ?versionStmt.
?+      ?versionStmt ps:P348 ?version.
?+      ?versionStmt pq:P577 ?publicationDate.
?+      ?versionStmt pq:P548 wd:Q2804309.
?+	}
?+  ORDER BY
?+      DESC(?publicationDate)
?+  LIMIT
?+      1
?=macos_stru as version[split(".")][join("_")]
?+	SELECT
?+		?version
?+	WHERE {
?+		wd:Q14116 p:P348 ?versionStmt.
?+      ?versionStmt ps:P348 ?version.
?+      ?versionStmt pq:P577 ?publicationDate.
?+	}
?+  ORDER BY
?+      DESC(?publicationDate)
?+  LIMIT
?+      1
Mac OS X / Safari {safari[0]} [Desktop]: Mozilla/5.0 (Macintosh; Intel Mac OS X {macos_stru}) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/{safari[join(".")]} Safari/605.1.15
?#
?# Last Internet Explorer version on Windows 7 x86-64
?# - Frozen, since there are no new releases of this anymore.
Windows / IE 11 [Desktop]: Mozilla/5.0 (Windows NT 6.1; WOW64; Trident/7.0; rv:11.0) like Gecko
?#
?# Microsoft Edge version on Windows 10 x86-64 based on Chromium
?#XXX: Cannot automatically update EdgeHTML version as each version ships with
?#     a different Chrome version token set.
?=edge as version[split(".")]
?+	SELECT
?+		?version
?+	WHERE {
?+		wd:Q18698690 p:P348 ?versionStmt.
?+      ?versionStmt ps:P348 ?version.
?+      ?versionStmt pq:P577 ?publicationDate.
?+      ?versionStmt pq:P400 wd:Q1406.
?+	}
?+  ORDER BY
?+      DESC(?publicationDate)
?+  LIMIT
?+      1
Windows / Edge {edge[0]} [Desktop]: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{edge[0]}.0.0.0 Safari/537.36 Edg/{edge[join(".")]}
?#Windows / Edge 44 [Desktop]: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/64.0.3282.140 Safari/537.36 Edge/18.17763
?#
?# Latest Google Chrome version on Windows 11 (same as Windows 10) x86-64
?# – The Safari and WebKit tokens are frozen and therefor irrelevant.
?=chrome as version[split(".")]
?+	SELECT
?+		?version
?+	WHERE {
?+		wd:Q777 p:P348 ?versionStmt.
?+      ?versionStmt ps:P348 ?version.
?+      ?versionStmt pq:P577 ?publicationDate.
?+      ?versionStmt pq:P548 wd:Q2804309.
?+	}
?+  ORDER BY
?+      DESC(?publicationDate)
?+  LIMIT
?+      1
Windows / Chrome {chrome[0]} [Desktop]: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{chrome[join(".")]} Safari/537.36
?#
?# Latest Firefox ESR version on Windows 11 (same as Windows 10) x86-64
?=firefox_esr as version[split()][0][split(".")]
?+	SELECT
?+		?version
?+	WHERE {
?+		wd:Q698 p:P348 ?versionStmt.
?+		?versionStmt ps:P348 ?version.
?+      ?versionStmt pq:P577 ?publicationDate.
?+		?versionStmt pq:P548 wd:Q104243413.
?+	}
?+	ORDER BY
?+		DESC(?publicationDate)
?+	LIMIT
?+		1
Windows / Firefox {firefox_esr[0]} ESR [Desktop]: Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:{firefox_esr[0]}.0) Gecko/20100101 Firefox/{firefox_esr[0]}.0

?# Latest Mobile Firefox and Chrome versions on latest Android aarch32
?=android_str as version
?+	SELECT
?+		?version
?+	WHERE {
?+		wd:Q94 p:P348 ?versionStmt.
?+      ?versionStmt ps:P348 ?version.
?+      ?versionStmt pq:P577 ?publicationDate.
?+	}
?+  ORDER BY
?+      DESC(?publicationDate)
?+  LIMIT
?+      1
Android Phone / Firefox {firefox[0]} [Mobile]: Mozilla/5.0 (Android {android_str}; Mobile; rv:{firefox[0]}.0) Gecko/{firefox[0]}.0 Firefox/{firefox[0]}.0
Android Phone / Chrome {chrome[0]} [Mobile]: Mozilla/5.0 (Linux; Android {android_str}; Z832 Build/MMB29M) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{chrome[join(".")]} Mobile Safari/537.36
Android Tablet / Firefox {firefox[0]} [Mobile]: Mozilla/5.0 (Android {android_str}; Tablet; rv:{firefox[0]}.0) Gecko/{firefox[0]}.0 Firefox/{firefox[0]}.0
Android Tablet / Chrome {chrome[0]} [Mobile]: Mozilla/5.0 (Linux; Android {android_str}; SAMSUNG-SM-T377A Build/NMF26X) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{chrome[join(".")]} Mobile Safari/537.36
?#
?# Latest Mobile Safari version on latest iOS aarch64
?#  – The Safari and WebKit tokens are frozen and therefor irrelevant.
?=ios_stru as version[split(".")][join("_")]
?+	SELECT
?+		?version
?+	WHERE {
?+		wd:Q48493 p:P348 ?versionStmt.
?+      ?versionStmt ps:P348 ?version.
?+      ?versionStmt pq:P577 ?publicationDate.
?+	}
?+  ORDER BY
?+      DESC(?publicationDate)
?+  LIMIT
?+      1
iPhone / Safari {safari[0]} [Mobile]: Mozilla/5.0 (iPhone; CPU OS {ios_stru} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/{safari[join(".")]} Mobile/14E304 Safari/605.1.15
iPad / Safari {safari[0]} [Mobile]: Mozilla/5.0 (iPad; CPU OS {ios_stru} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/{safari[join(".")]} Mobile/15E148 Safari/605.1.15

?# GoogleBot web crawler
?# - While GoogleBot is continually being developed this string is afaik frozen.
Google Bot [Bot]: Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)
?# Twitter's and Facebook's crawlers are often whitelisted so they can access social media <meta> tags.
Twitter Bot [Bot]: Twitterbot/1.0
Facebook Bot [Bot]: facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)
?#
?# Latest PlayStation 5 stock browser (more or less)
PS5 [Other]: Mozilla/5.0 (PlayStation; PlayStation 5/6.50) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.4 Safari/605.1.15
?#
?# Latest CURL and WGet version on Linux x86-64
?=curl_str as version
?+	SELECT
?+		?version
?+	WHERE {
?+		wd:Q286306 p:P348 ?versionStmt.
?+      ?versionStmt ps:P348 ?version.
?+      ?versionStmt pq:P577 ?publicationDate.
?+	}
?+  ORDER BY
?+      DESC(?publicationDate)
?+  LIMIT
?+      1
Curl [Other]: curl/{curl_str}
?=wget_str as version
?+	SELECT
?+		?version
?+	WHERE {
?+		wd:Q535461 p:P348 ?versionStmt.
?+      ?versionStmt ps:P348 ?version.
?+      ?versionStmt pq:P577 ?publicationDate.
?+	}
?+  ORDER BY
?+      DESC(?publicationDate)
?+  LIMIT
?+      1
Wget [Other]: Wget/{wget_str} (linux-gnu)
