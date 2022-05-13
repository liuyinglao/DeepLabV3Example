import * as React from 'react';
import {
  Canvas,
  CanvasRenderingContext2D,
  ImageUtil,
  media,
  Tensor,
  torch,
  torchvision,
} from 'react-native-pytorch-core';
import {
  ActivityIndicator,
  Button,
  Image,
  StyleSheet,
  View,
  Dimensions,
  Alert,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import useModel from './useModel';

const MODEL =
  'https://github.com/pytorch/live/releases/download/v0.1.0/deeplabv3.ptl';

// images are selected from the PASCAL VOC2012 dataset
const IMAGES = [
  'https://raw.githubusercontent.com/liuyinglao/TestData/main/airplane_resized.jpeg',
  'https://raw.githubusercontent.com/liuyinglao/TestData/main/voc2012_02.jpeg',
  'https://raw.githubusercontent.com/liuyinglao/TestData/main/voc2012_06.jpeg',
  'https://raw.githubusercontent.com/liuyinglao/TestData/main/voc2012_13.jpeg',
  'https://raw.githubusercontent.com/liuyinglao/TestData/main/voc2012_07.jpeg',
  'https://raw.githubusercontent.com/liuyinglao/TestData/main/voc2012_08.jpeg',
  'https://github.com/pytorch/hub/raw/master/images/deeplab1.png',
];

// colors are selected from https://reactnative.dev/docs/colors#color-keywords
// they are corresponding to the following class:
// ['__background__', 'aeroplane', 'bicycle', 'bird', 'boat', 'bottle', 'bus',
//  'car', 'cat', 'chair', 'cow', 'diningtable', 'dog', 'horse', 'motorbike',
//  'person', 'pottedplant', 'sheep', 'sofa', 'train', 'tvmonitor']
const PALETTE = [
  'aliceblue',
  'cornflowerblue',
  'cornsilk',
  'crimson',
  'cyan',
  'darkblue',
  'darkcyan',
  'darkgoldenrod',
  'darkgray',
  'antiquewhite',
  'aqua',
  'aquamarine',
  'beige',
  'blue',
  'blueviolet',
  'brown',
  'burlywood',
  'cadetblue',
  'chartreuse',
  'chocolate',
  'coral',
];

type DeepLabV3Result = {
  out: Tensor;
};

function ImageSegmentation() {
  // Insets to respect notches and menus to safely render content
  const insets = useSafeAreaInsets();
  // Load model from a given url.
  const { isReady, model } = useModel(MODEL)
  // Indicates an inference in-flight
  const [isProcessing, setIsProcessing] = React.useState(false);
  // Ref to canvas to draw segmentation results on top of image
  const context2DRef = React.useRef<CanvasRenderingContext2D | null>(null);

  const [imageIndex, setImageIndex] = React.useState(0);
  const img = React.useMemo(() => IMAGES[imageIndex], [imageIndex]);

  const handleImage = React.useCallback(async (imageUrl: string) => {
    // Show feedback to the user if the model hasn't loaded. This shouldn't
    // happen because the isReady variable is only true when the model loaded
    // and isReady. However, this is a safeguard to provide user feedback in
    // unknown edge cases ;)
    if (model == null) {
      Alert.alert('Model not loaded', 'The model has not been loaded yet');
      return;
    }

    setIsProcessing(true);

    const ctx = context2DRef.current;
    if (ctx !== null) {
      ctx.clear();
      await ctx.invalidate();
    }

    const image = await ImageUtil.fromURL(imageUrl);
    const height = image.getHeight();
    const width = image.getWidth();
    const blob = media.toBlob(image);
    let tensor = torch.fromBlob(blob, [height, width, 3])
      .to({ dtype: torch.float32 })
      .div(255)
      .permute([2, 0, 1]);

    let normalize = torchvision.transforms.normalize(
      [0.485, 0.456, 0.406],
      [0.229, 0.224, 0.225],
    );
    tensor = normalize(tensor);
    tensor = tensor.unsqueeze(0);

    const output = await model.forward(tensor) as DeepLabV3Result;

    const max = output?.out.squeeze(0).argmax({ dim: 0 });

    if (ctx !== null) {
      const windowWidth = Dimensions.get('window').width;

      const newScaleFactor = Math.min(250 / height, windowWidth / width);

      ctx.save();

      // Hardcoding the scale factor to fit most of the example images for demo
      ctx.scale(newScaleFactor, newScaleFactor);

      // Render original image on canvas before painting pixels
      ctx.drawImage(image, 0, 0, width, height);

      const colors = max.data;
      for (let i = 0; i < height; i++) {
        for (let j = 0; j < width; j++) {
          let idx = colors[i * width + j];
          if (idx > 0) {
            ctx.fillStyle = PALETTE[idx];
            ctx.fillRect(j, i, 1, 1);
          }
        }
      }

      ctx.restore();

      await ctx.invalidate();
    }

    setIsProcessing(false);
  }, [context2DRef, model, setIsProcessing]);

  function updateImageIndex(diff: number) {
    setImageIndex(v => {
      const nextVal = v + diff;
      if (nextVal < 0) {
        return v;
      }
      else if (nextVal >= IMAGES.length) {
        return v;
      }
      return nextVal;
    });
  }

  return (
    <View style={[StyleSheet.absoluteFill, styles.container, insets]}>
      <View style={styles.navigationButtonContainer}>
        <Button
          title="Prev"
          onPress={() => {
            updateImageIndex(-1);
          }}
        />
        <Button
          title="Next"
          onPress={() => {
            updateImageIndex(1);
          }}
        />
      </View>
      <Image style={styles.image} source={{ uri: IMAGES[imageIndex] }} />
      {isReady ? <Button
        title="Segment pictures"
        onPress={() => handleImage(IMAGES[imageIndex])}
      /> : <ActivityIndicator color="blue" size="large" />
      }
      {isProcessing && <ActivityIndicator color="blue" size="large" />}
      <View style={styles.canvas}>
        <Canvas
          style={StyleSheet.absoluteFill}
          onContext2D={ctx => {
            context2DRef.current = ctx;
          }}
        />
      </View>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ImageSegmentation />
    </SafeAreaProvider>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'white',
  },
  navigationButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  canvas: {
    marginVertical: 20,
    width: '100%',
    height: 250,
  },
  image: {
    width: '100%',
    height: 300,
    resizeMode: 'cover',
  }
});
