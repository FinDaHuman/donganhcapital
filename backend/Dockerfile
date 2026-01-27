# Use official Python runtime as a parent image
FROM python:3.9-slim

# Set the working directory in the container
WORKDIR /code

# Copy the requirements file into the container
COPY ./requirements.txt /code/requirements.txt

# Install packages
RUN pip install --no-cache-dir --upgrade -r /code/requirements.txt

# Copy the backend code
COPY . /code

# Copy the data folder (Must be at root level relative to build context)
# Assuming build context is 'backend' folder, but data is inside backend/data based on current structure.
# If build context is root, we need to adjust. 
# Standard practice: Build from backend folder. 
# Verify: data is in `d:\Vs Code\DongAnhCapital\backend\data`. 
# So `COPY . /code` includes `data/`.

# Expose port
EXPOSE 8000

# Command to run the app
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
