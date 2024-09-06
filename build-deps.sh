#! /bin/bash

SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )

basic_cmake() {
    dir=$1
    cmake -DCMAKE_INSTALL_PREFIX=./ -S $SCRIPT_DIR/$dir -B $SCRIPT_DIR/$dir/build
    (cd $SCRIPT_DIR/$dir/build && make && make install)
}

basic_cmake freetype
basic_cmake ogg
basic_cmake vorbis
basic_cmake flac