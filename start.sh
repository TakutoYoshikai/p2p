#!/bin/sh

for i in `seq 0 199`; do
	sleep 1.5s;
	node p2p.js `expr 8000 + $i` &
done
