#!/bin/sh

for i in `seq 1 150`; do
	sleep 1.5s;
	node main.js `expr 7999 + $i` &
done
