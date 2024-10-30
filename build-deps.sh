#! /bin/bash

if [ -z "$CONFIGURATION" ]; then
    CONFIGURATION=Release
fi

ARCH="$1"

basic_cmake() {
    dir=$1
    extra=$2
    xcode=$3

    echo "calling cmake $dir"
    cmake $extra -DBUILD_FRAMEWORK=1 -DCMAKE_OSX_ARCHITECTURES="$ARCH" -DINSTALL_MANPAGES=OFF -DCMAKE_INSTALL_PREFIX=./ -S $dir -B $dir/build

    echo "building $dir"
    if [ -z "$xcode" ]; then
        (cd $dir/build && make && make install) # || exit 1
    else
        (cd $dir/build && xcodebuild -arch "$ARCH" -configuration "$CONFIGURATION")
    fi
}

basic_cmake ogg
if [ "$(uname)" = "Darwin" ]; then
    cp -a Ogg.framework lib/
else
    ls include
    ls lib
fi

basic_cmake vorbis "-DBUILD_TESTING=0 -DOGG_ROOT=$(pwd)"

if [ "$(uname)" = "Darwin" ]; then
    cp -a vorbis/build/lib/Vorbis.framework lib/
fi

basic_cmake flac "-DOGG_ROOT=$(pwd)"

flags=""
xcode=""
if [ "$(uname)" = "Darwin" ]; then
    flags="-GXcode -DCMAKE_GENERATOR=Xcode"
    xcode="true"
fi

basic_cmake freetype "$flags" "$xcode"

if [ "$(uname)" = "Darwin" ]; then
    cp -a freetype/build/$CONFIGURATION/freetype.framework lib/
fi