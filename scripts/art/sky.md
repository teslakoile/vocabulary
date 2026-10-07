# The painted sky

`src/assets/sky.webp` is the painting at the foot of each question and the key
screen. It was generated once with OpenAI's `gpt-image-1.5` at 1536x1024, high
quality, then graded so its sky matches the page's `--sky` (#3a7bc4):

```bash
magick sky-a.png -modulate 86,71 -resize 1200x -quality 80 src/assets/sky.webp
```

The prompt:

> A painted summer sky with a bank of cumulus clouds and the branches of a
> tree. The upper third is completely plain, flat, cloudless blue sky in
> exactly #3a7bc4. Billowing white cumulus clouds with soft lavender-grey
> shadows rise from the bottom edge across the lower half; at the right edge,
> leafy tree branches with green and golden autumn leaves reach in from the
> lower right corner. Traditional gouache and oil painting, visible dry-brush
> strokes, flat posterised tones. No text, logos, border, sun, birds, people,
> or ground.

The app fades the top of the image out with a CSS mask, so a small difference
between the painted blue and the page blue does not show as an edge.

## The small pieces

`src/assets/twig.webp`, `cloud-wide.webp` and `cloud-puff.webp` are the pieces
`Drift` scatters in the margins. Each was generated once with `gpt-image-1.5`
at high quality with `--background transparent`, in the same gouache style as
the large painting (1536x1024 for the wide cloud, 1024x1024 for the others).
The prompts name one subject each (a low flat-bottomed cumulus, a round puff
with two wisps, a leafy twig reaching in from the top left) plus the style line
"traditional gouache and oil painting, visible dry-brush strokes, flat posterised
tones", with no sky, border, text or ground. Then each was cleaned and graded:

```bash
magick cloud-wide.png -channel A -fx "a<0.06?0:a" +channel -trim +repage -modulate 100,85 -resize 640x -quality 82 -define webp:alpha-quality=90 cloud-wide.webp
magick cloud-puff.png -channel A -fx "a<0.06?0:a" +channel -trim +repage -modulate 100,85 -resize 420x -quality 82 -define webp:alpha-quality=90 cloud-puff.webp
magick twig.png -channel A -fx "a<0.06?0:a" +channel -trim +repage -modulate 86,58 -resize 520x -quality 82 -define webp:alpha-quality=90 twig.webp
```

The alpha clean-up removes the faint haze the model leaves around a transparent
subject, which otherwise stops `-trim` from cropping. The twig is desaturated
more than the clouds because its first pass was a stronger orange than the tree
in the large painting.
