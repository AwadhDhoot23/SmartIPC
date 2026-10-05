.PHONY: build test clean

build:
	$(MAKE) -C cpp

test: build
	python3 -m pytest -q tests

clean:
	$(MAKE) -C cpp clean
	rm -f data/smartipc.db

profile: build
	python3 scripts/profile.py --quick

export: 
	python3 scripts/export_csv.py
