#! /bin/bash

basic_cmake() {
    dir=$1
    extra=$2

    ARCH=$(uname -m)

    cmake $extra -DBUILD_FRAMEWORK=1 -DCMAKE_OSX_ARCHITECTURES="$ARCH" -DINSTALL_MANPAGES=OFF -DCMAKE_INSTALL_PREFIX=./ -S $dir -B $dir/build
    (cd $dir/build && (xcodebuild -arch "$ARCH" -configuration "$CONFIGURATION" || make && make install)) || exit 1
}

basic_cmake ogg
cp -r Ogg.framework lib/

basic_cmake vorbis "-DBUILD_TESTING=0 -DOGG_ROOT=$(pwd)"

cp -r vorbis/build/lib/Vorbis.framework lib/

basic_cmake flac "-DOGG_ROOT=$(pwd)"

flags=""
if [ "$(uname)" = "Darwin" ]; then
    flags="-GXcode -DCMAKE_GENERATOR=Xcode"
fi

basic_cmake freetype $flags
cp -r Library/Frameworks/freetype.framework lib/