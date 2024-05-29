import React, { useState } from 'react';
import axios from 'axios';
import { Button, Label, TextInput, FileInput } from 'flowbite-react';

/** Home component for our front-end. I used flowbite, which was very fast &
 * easy to implement.
 */
const Home = () => {
  const [inputText, setInputText] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);

  const handleFileChange = (event) => {
    setSelectedFile(event.target.files[0]);
  };

  /** Submit should handle file upload, but without letting the file content
   * touch any Lambda function and make sure that it's done directly from the browser.
   * I thought a good approach was to use pre-signed URLs:
   */
  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!selectedFile) {
      alert('Please select a file.');
      return;
    }
    /** NOTE: The docs at  https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/command/PutObjectCommand/
     * mention Data integrity with Md-5. This is a big to-do and something I would do for production.
     * 
     * TO-DO: Calculate MD-5 and include in header and use Content-MD5, to ensure data integrity
    */
    try {
      const apiEndpoint = 'https://gz14rxqcvj.execute-api.us-east-2.amazonaws.com/prod';

      // Fetch presigned URL from API
      const presignUrlResponse = await axios.get(
        `${apiEndpoint}/generate-presigned-url`,
        { params: { fileName: selectedFile.name } }
      );

      const presignedUrl = presignUrlResponse.data.url;

      /* Check to make sure we have a presigned URL. */
      if (!presignedUrl) {
        throw new Error('Presigned URL not found');
        console.log('Error fetching the presigned url - not present');
      }

      /** Add to table with PUT request.  */
      await axios.put(presignedUrl, selectedFile, {
        headers: {
          'Content-Type': selectedFile.type,
        },
      });

      //console.log('File uploaded successfully. Adding to DynamoTable');

      /** Add input text and filename to DynamoDB table! */
      const addToTableResponse = await axios.post(`${apiEndpoint}/add-table`, {
        inputText,
        fileName: selectedFile.name,
      });
      /** To-do: add fail checks */
      alert('Your file was uploaded! The FileTable will be uploaded and your script will run soon.');
    } catch (error) {
      console.error('Error uploading file :', error);
      alert('Error uploading file and saving data. Please try again.');
    }
  };

  return (
    <div id="contentwrapper" className="flex m-8 items-center justify-center">
      <form onSubmit={handleSubmit} className="flex flex-col max-w-md gap-4 w-full">
        <div className="w-full">
          <div className="mb-2 block w-full">
            <Label htmlFor="base" value="Text input" />
          </div>
          <TextInput
            id="base"
            type="text"
            sizing="md"
            className="w-full"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
          />
        </div>

        <div id="fileUpload" className="w-full">
          <div className="mb-2 block">
            <Label htmlFor="file" value="File input" />
          </div>
          <FileInput
            id="file"
            helperText="Full Stack demo by aden@vt.edu."
            className="w-full"
            onChange={handleFileChange}
          />
        </div>

        <div id="buttonWrapper" className="w-full mt-4 flex justify-center">
          <Button type="submit" color="blue" size="xl" className="w-44">
            Submit!
          </Button>
        </div>
      </form>
    </div>
  );
};

export default Home;

