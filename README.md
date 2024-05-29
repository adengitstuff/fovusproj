# Fovus App

This is a small demo of a full-stack project made quickly. I used Flowbite Tailwind and React for the front-end, and AWS services
for the backend.

# Approach
The app just takes an input and passes it to S3 directly from the browser. A lambda function is used to generate pre-signed URLS,
and a separate function is used to add data to a dynamoDB Table. Insertions into the table are triggers for a third Lambda function,
which parses data and runs the scripts with essential, minimum error handling. This was a really interesting project and I thank you guys
for the opportunity to work on this! 

# Deployment/ Demo Steps

I used Amplify to host this as recommended, making sure not to use any backend or frontend Amplify products. Demo can be in 3 steps:

Step 1: Go to Amplify endpoint:

https://dev.d2pmm485td5mzr.amplifyapp.com/

*(Note that there is a Sign-In component there as well. I plan to continue this project and integrate with Cognito and simply included it!)


Step 2: Log into AWS Backend. Watch any services and monitor Cloudwatch, DynamoDB Table, S3, EC2, Lambdas, and more:

    1. Go to aws.amazon.com and click "Sign In"
    2. Click "IAM user" in order to sign in

    It will ask for the following info:

    Account ID: 654654352890
    IAM Username: Fovusteam
    Password: Fovus*123

Step 3: You should be able to simply type in input and submit a file. 


