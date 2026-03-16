import environment from '../../config';

const handleRequest = async (req, res) => {
    const { method } = req;

    switch (method) {
        case 'GET':
            // Implement listing logic here
            break;
        case 'DELETE':
            // Implement delete logic here
            break;
        case 'POST':
            // Implement upload logic here
            break;
        case 'PUT':
            // Implement rename logic here
            break;
        default:
            res.status(405).end(); // Method Not Allowed
            break;
    }
};

export default handleRequest;