cd "$(dirname "$0")"
for e in ${EXPRS:-sorprendida molesta pensando}; do
  rm -rf ex_$e/frames; mkdir -p ex_$e
  BRIA_EXPR=$e python3 expr_anim.py ex_$e > ex_$e/log.txt 2>&1
  ffmpeg -y -loglevel error -f lavfi -i color=c=0xEEF8F6:s=720x900:r=30 -framerate 30 -i ex_$e/frames/f%04d.png -filter_complex "[0][1]overlay=shortest=1,format=yuv420p" -c:v libx264 -preset veryfast -crf 18 -movflags +faststart ex_$e/bria-$e.mp4
  ffmpeg -y -loglevel error -framerate 30 -i ex_$e/frames/f%04d.png -c:v libvpx-vp9 -pix_fmt yuva420p -b:v 0 -crf 32 -row-mt 1 ex_$e/bria-$e-transparente.webm
  python3 check_jumps.py ex_$e/frames >> run_ex.log; echo "$e listo" >> run_ex.log
done
