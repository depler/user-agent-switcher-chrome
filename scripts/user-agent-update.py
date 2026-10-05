#!/usr/bin/python3
import pathlib
import sys
import time
import urllib.error

__file__ = pathlib.Path(__file__).absolute()
__base__ = __file__.parent.parent

import SPARQLWrapper as sparql


class TemplateValue:
	def __init__(self, value: object):
		self.value = value
	
	@classmethod
	def wrap_value(cls, value: str or list):
		if isinstance(value, cls):
			return value
		elif isinstance(value, dict):
			return TemplateDict(value)
		elif isinstance(value, list):
			return TemplateList(value)
		elif isinstance(value, str):
			return TemplateStr(value)
		else:
			return cls(value)
	
	def get_value_attr(self, name) -> object:
		return getattr(self.value, name)
	
	def __repr__(self) -> str:
		return "{0}({1!r})".format(self.__class__.__qualname__, self.value)
	
	def __str__(self) -> str:
		return str(self.value)
	
	def __getitem__(self, action) -> object:
		action = str(action)
		
		# Parse numeric range and item queries
		try:
			range_parts = list(map(int, action.split(":")))
		except ValueError:
			pass
		else:
			if len(range_parts) == 1:
				return self.wrap_value(self.value[range_parts[0]])
			elif len(range_parts) == 2:
				return self.wrap_value(self.value[range_parts[0]:range_parts[1]])
		
		# Parse method and property queries
		if "(" in action:
			name, args_str = action.split("(", 1)
			
			args_str = args_str.split(")")[0]
			
			args = eval(args_str) if args_str.strip() else ()
			if not isinstance(args, tuple):
				args = (args,)
		else:
			name, args = action, None
		
		item = self.get_value_attr(name)
		if args is not None:
			item = item(*args)
		return self.wrap_value(item)


class TemplateDict(TemplateValue):
	def get_value_attr(self, name) -> object:
		if name in self.value:
			return self.value[name]
		return super().get_value_attr(name)


class TemplateList(TemplateValue):
	def get_value_attr(self, name) -> object:
		if name == "join":
			return lambda s: s.join(self.value)
		return super().get_value_attr(name)


class TemplateStr(TemplateValue):
	pass



def parse_template_file(path: pathlib.Path):
	template_data = []
	params_sparql = {}
	
	with open(str(path), "r", encoding="utf-8") as template_file:
		params_sparql_cur = None
		for idx, line in enumerate(template_file, 1):
			if line.startswith("?="):  # SPARQL-backed definition line
				parts = line[2:].split(maxsplit=2)
				if len(parts) != 3 or parts[1] != "as":
					raise ValueError("Invalid SPARQL start on line {0}: {1}".format(idx, line))
				
				params_sparql_cur = parts[0]
				params_sparql[params_sparql_cur] = {
					"pattern": parts[2].strip(),
					"sparql":  ""
				}
			elif line.startswith("?+"):  # SPARQL-backed query line
				content = line[2:]
				if not params_sparql_cur:
					raise ValueError("Unexpected SPARQL continuation on line {0}: {1}".format(idx, line))
				params_sparql[params_sparql_cur]["sparql"] += content
			elif line.startswith("?#"):  # Preprocessor comment line
				continue
			elif line.startswith("?"):  # Reserved
				raise ValueError("Unexpected data on line {0}: {1}".format(idx, line))
			else:  # Output template line
				template_data += (line,)
	
	return "".join(template_data), params_sparql

def expand_sparql_params(params_sparql: dict, url: str):
	sparql_client = sparql.SPARQLWrapper(url)
	sparql_client.setReturnFormat(sparql.JSON)
	try:
		secrets_path = __base__ / "wikidata-api-secret.txt"
		with open(secrets_path) as f:
			client_name = f.readline().rstrip("\n")  # unused
			client_secret = f.readline().rstrip("\n")  # unused
			api_token = f.readline().rstrip("\n")
		sparql_client.addCustomHttpHeader("Authorization", f"Bearer {api_token}")
		print(f" * Loaded API token from “{secrets_path}”")
	except (IOError, EOFError) as exc:
		print(f" * Failed to load API token from “{secrets_path}” – continuing tokenless: {type(exc).__name__}: {exc}")
	
	params = {}
	for name, properties in params_sparql.items():
		pattern      = properties["pattern"]
		query_string = properties["sparql"]
		
		# “Parse” the given `pattern` value into a basename and a set of
		# selector expressions - similar to `str.format` but this way the
		# result of our parsing doesn't have to end up being a string
		pat_name      = ""
		pat_selectors = []
		selector_cur   = None
		brace_level    = 0
		within_str     = False
		within_str_esc = False
		for char in pattern:
			if not pat_selectors and selector_cur is None:
				if char == "[":
					selector_cur = ""
					brace_level += 1
				else:
					pat_name += char
			else:
				if within_str:
					if char == within_str and not within_str_esc:
						within_str = False
				elif char == "[":
					brace_level += 1
					if brace_level == 1:
						selector_cur = ""
						continue
				elif char == "]":
					brace_level -= 1
				
				if brace_level > 0:
					selector_cur += char
				else:
					pat_selectors.append(selector_cur)
		
		for retry in range(5):
			# Submit query to service
			print(" × Querying WikiData for “{0}”…".format(name), file=sys.stderr)
			sparql_client.setQuery(query_string)
			try:
				query_result = sparql_client.query().convert()["results"]["bindings"][0]
				query_result = dict(map(lambda i: (i[0],i[1]["value"]), query_result.items()))
				break
			except urllib.error.HTTPError as exc:
				if retry == 4:  # Retries Exceeded
					raise
				
				# Give server time to recover, extra time on Too Many Requests
				time.sleep(10 if exc.getcode() != 429 else 61)
		
		# Apply expansion pattern on result to extract the final value
		value = TemplateValue.wrap_value(query_result)
		for selector in [pat_name] + pat_selectors:
			value = value[selector]
		params[name] = value
	return params



print("Extracting template string and SPARQL queries from template…", file=sys.stderr)
template, params_sparql = parse_template_file(__base__ / "assets" / "user-agents.tpl")
print("Done extracting template string and SPARQL queries!", file=sys.stderr)

print("Querying WikiData with extracted SPARQL queries…", file=sys.stderr)
params = expand_sparql_params(params_sparql, "https://query.wikidata.org/sparql")
print("Done querying WikiData!", file=sys.stderr)

print("Applying queried parameters to template string…", file=sys.stderr)
with open(str(__base__ / "assets" / "user-agents.txt"), "w", encoding="utf-8") as file:
	print(template.format(**params), file=file)
print("Done generating template!", file=sys.stderr)
