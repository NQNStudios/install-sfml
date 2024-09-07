#! /bin/bash

basic_cmake() {
    dir=$1
    cmake DINSTALL_MANPAGES=OFF -DCMAKE_INSTALL_PREFIX=./ -S $dir -B $dir/build
    (cd $dir/build && make && make install)
}

basic_cmake ogg
basic_cmake vorbis
basic_cmake flac
basic_cmake freetype