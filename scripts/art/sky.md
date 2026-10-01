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
