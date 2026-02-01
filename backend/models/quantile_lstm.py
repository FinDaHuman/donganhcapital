import tensorflow as tf
import numpy as np
import joblib
import os

# Use tf.keras directly to avoid compatibility issues
keras = tf.keras
layers = tf.keras.layers
import joblib
import os

class QuantileLSTM:
    def __init__(self, sequence_length=60, n_steps=10, quantiles=[0.05, 0.5, 0.95]):
        self.sequence_length = sequence_length
        self.n_steps = n_steps
        self.quantiles = quantiles
        self.model = None
        self.scaler = None
        self.feature_columns = None
    
    def build_model(self, input_dim):
        inputs = keras.Input(shape=(self.sequence_length, input_dim))
        
        # Bidirectional LSTM for better context capture
        x = layers.Bidirectional(layers.LSTM(128, return_sequences=True))(inputs)
        x = layers.Dropout(0.2)(x)
        x = layers.Bidirectional(layers.LSTM(64))(x)
        x = layers.Dropout(0.2)(x)
        
        # Output layer: [n_steps × n_quantiles]
        # We need to output logic for each step and each quantile
        x = layers.Dense(self.n_steps * len(self.quantiles))(x)
        outputs = layers.Reshape((self.n_steps, len(self.quantiles)))(x)
        
        model = keras.Model(inputs=inputs, outputs=outputs)
        
        # Custom quantile loss
        def quantile_loss(y_true, y_pred):
            # y_true shape: (batch, n_steps, 1) - actual price
            # y_pred shape: (batch, n_steps, n_quantiles)
            losses = []
            for i, q in enumerate(self.quantiles):
                error = y_true - y_pred[:, :, i:i+1] # broadcast subtraction
                loss = tf.maximum(q * error, (q - 1) * error)
                losses.append(tf.reduce_mean(loss))
            return tf.add_n(losses)
        
        model.compile(optimizer=keras.optimizers.Adam(1e-3), loss=quantile_loss)
        return model
    
    def train(self, X, y, validation_split=0.2, epochs=50, batch_size=64):
        input_dim = X.shape[2]
        self.model = self.build_model(input_dim)
        
        callbacks = [
            keras.callbacks.EarlyStopping(patience=10, restore_best_weights=True),
            keras.callbacks.ReduceLROnPlateau(factor=0.5, patience=5, verbose=1)
        ]
        
        print(f"Training Model on input shape: {X.shape}...")
        history = self.model.fit(
            X, y, 
            epochs=epochs, 
            batch_size=batch_size, 
            validation_split=validation_split, 
            callbacks=callbacks,
            verbose=1
        )
        return history
    
    def predict(self, X):
        """Returns shape: (n_samples, n_steps, n_quantiles)"""
        if self.model is None:
            raise Exception("Model not trained or loaded")
        return self.model.predict(X, verbose=0)
    
    def save(self, filepath):
        # Save TensorFlow model
        # We save weights/arch mainly.
        # Note: Saving custom loss models can be tricky to reload without providing the custom object
        # So we save standard h5.
        if self.model:
            self.model.save(f"{filepath}_model.h5")
        
        # Save metadata
        joblib.dump({
            'scaler': self.scaler,
            'feature_columns': self.feature_columns,
            'sequence_length': self.sequence_length,
            'n_steps': self.n_steps,
            'quantiles': self.quantiles
        }, f"{filepath}_meta.pkl")
        print(f"Saved model to {filepath}_model.h5 and metadata to {filepath}_meta.pkl")
    
    @classmethod
    def load(cls, filepath):
        # Load metadata
        meta_path = f"{filepath}_meta.pkl"
        model_path = f"{filepath}_model.h5"
        
        if not os.path.exists(meta_path) or not os.path.exists(model_path):
            raise FileNotFoundError(f"Model files not found at {filepath}")

        meta = joblib.load(meta_path)
        instance = cls(
            sequence_length=meta['sequence_length'],
            n_steps=meta['n_steps'],
            quantiles=meta['quantiles']
        )
        instance.scaler = meta['scaler']
        instance.feature_columns = meta['feature_columns']
        
        # Custom loss needed for loading if we want to continue training, 
        # but for prediction we technically just need the graph.
        # However, load_model checks for it.
        def quantile_loss(y_true, y_pred):
             # Re-define or stub, mainly needed for loading the compile state
             return tf.reduce_mean(y_true - y_pred) # Stub

        instance.model = keras.models.load_model(
            model_path,
            compile=False # We usually don't need to re-compile for inference
        )
        return instance
