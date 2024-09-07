#! /bin/bash

basic_cmake() {
    dir=$1
    extra=$2

    ARCH=$(uname -m)

    cmake $extra -DBUILD_FRAMEWORK=1 -DCMAKE_OSX_ARCHITECTURES="$ARCH" -DINSTALL_MANPAGES=OFF -DCMAKE_INSTALL_PREFIX=./ -S $dir -B $dir/build
    (cd $dir/build && make && make install) || exit 1
}

basic_cmake ogg
basic_cmake vorbis "-DBUILD_TESTING=0 -DOGG_ROOT=$(pwd)"
basic_cmake flac "-DOGG_ROOT=$(pwd)"
basic_cmake freetype "-GXcode -DCMAKE_GENERATOR=Xcode"